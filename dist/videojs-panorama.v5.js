(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*! npm.im/intervalometer */
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function intervalometer(cb, request, cancel, requestParameter) {
	var requestId;
	var previousLoopTime;
	function loop(now) {
		// must be requested before cb() because that might call .stop()
		requestId = request(loop, requestParameter);

		// called with "ms since last call". 0 on start()
		cb(now - (previousLoopTime || now));

		previousLoopTime = now;
	}
	return {
		start: function start() {
			if (!requestId) { // prevent double starts
				loop(0);
			}
		},
		stop: function stop() {
			cancel(requestId);
			requestId = null;
			previousLoopTime = 0;
		}
	};
}

function frameIntervalometer(cb) {
	return intervalometer(cb, requestAnimationFrame, cancelAnimationFrame);
}

function timerIntervalometer(cb, delay) {
	return intervalometer(cb, setTimeout, clearTimeout, delay);
}

exports.intervalometer = intervalometer;
exports.frameIntervalometer = frameIntervalometer;
exports.timerIntervalometer = timerIntervalometer;
},{}],2:[function(require,module,exports){
/*! npm.im/iphone-inline-video */
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var Symbol = _interopDefault(require('poor-mans-symbol'));
var intervalometer = require('intervalometer');

function preventEvent(element, eventName, toggleProperty, preventWithProperty) {
	function handler(e) {
		if (Boolean(element[toggleProperty]) === Boolean(preventWithProperty)) {
			e.stopImmediatePropagation();
			// console.log(eventName, 'prevented on', element);
		}
		delete element[toggleProperty];
	}
	element.addEventListener(eventName, handler, false);

	// Return handler to allow to disable the prevention. Usage:
	// const preventionHandler = preventEvent(el, 'click');
	// el.removeEventHandler('click', preventionHandler);
	return handler;
}

function proxyProperty(object, propertyName, sourceObject, copyFirst) {
	function get() {
		return sourceObject[propertyName];
	}
	function set(value) {
		sourceObject[propertyName] = value;
	}

	if (copyFirst) {
		set(object[propertyName]);
	}

	Object.defineProperty(object, propertyName, {get: get, set: set});
}

function proxyEvent(object, eventName, sourceObject) {
	sourceObject.addEventListener(eventName, function () { return object.dispatchEvent(new Event(eventName)); });
}

function dispatchEventAsync(element, type) {
	Promise.resolve().then(function () {
		element.dispatchEvent(new Event(type));
	});
}

// iOS 10 adds support for native inline playback + silent autoplay
var isWhitelisted = 'object-fit' in document.head.style && /iPhone|iPod/i.test(navigator.userAgent) && !matchMedia('(-webkit-video-playable-inline)').matches;

var ಠ = Symbol();
var ಠevent = Symbol();
var ಠplay = Symbol('nativeplay');
var ಠpause = Symbol('nativepause');

/**
 * UTILS
 */

function getAudioFromVideo(video) {
	var audio = new Audio();
	proxyEvent(video, 'play', audio);
	proxyEvent(video, 'playing', audio);
	proxyEvent(video, 'pause', audio);
	audio.crossOrigin = video.crossOrigin;

	// 'data:' causes audio.networkState > 0
	// which then allows to keep <audio> in a resumable playing state
	// i.e. once you set a real src it will keep playing if it was if .play() was called
	audio.src = video.src || video.currentSrc || 'data:';

	// if (audio.src === 'data:') {
	//   TODO: wait for video to be selected
	// }
	return audio;
}

var lastRequests = [];
var requestIndex = 0;
var lastTimeupdateEvent;

function setTime(video, time, rememberOnly) {
	// allow one timeupdate event every 200+ ms
	if ((lastTimeupdateEvent || 0) + 200 < Date.now()) {
		video[ಠevent] = true;
		lastTimeupdateEvent = Date.now();
	}
	if (!rememberOnly) {
		video.currentTime = time;
	}
	lastRequests[++requestIndex % 3] = time * 100 | 0 / 100;
}

function isPlayerEnded(player) {
	return player.driver.currentTime >= player.video.duration;
}

function update(timeDiff) {
	var player = this;
	// console.log('update', player.video.readyState, player.video.networkState, player.driver.readyState, player.driver.networkState, player.driver.paused);
	if (player.video.readyState >= player.video.HAVE_FUTURE_DATA) {
		if (!player.hasAudio) {
			player.driver.currentTime = player.video.currentTime + ((timeDiff * player.video.playbackRate) / 1000);
			if (player.video.loop && isPlayerEnded(player)) {
				player.driver.currentTime = 0;
			}
		}
		setTime(player.video, player.driver.currentTime);
	} else if (player.video.networkState === player.video.NETWORK_IDLE && !player.video.buffered.length) {
		// this should happen when the source is available but:
		// - it's potentially playing (.paused === false)
		// - it's not ready to play
		// - it's not loading
		// If it hasAudio, that will be loaded in the 'emptied' handler below
		player.video.load();
		// console.log('Will load');
	}

	// console.assert(player.video.currentTime === player.driver.currentTime, 'Video not updating!');

	if (player.video.ended) {
		delete player.video[ಠevent]; // allow timeupdate event
		player.video.pause(true);
	}
}

/**
 * METHODS
 */

function play() {
	// console.log('play');
	var video = this;
	var player = video[ಠ];

	// if it's fullscreen, use the native player
	if (video.webkitDisplayingFullscreen) {
		video[ಠplay]();
		return;
	}

	if (player.driver.src !== 'data:' && player.driver.src !== video.src) {
		// console.log('src changed on play', video.src);
		setTime(video, 0, true);
		player.driver.src = video.src;
	}

	if (!video.paused) {
		return;
	}
	player.paused = false;

	if (!video.buffered.length) {
		// .load() causes the emptied event
		// the alternative is .play()+.pause() but that triggers play/pause events, even worse
		// possibly the alternative is preventing this event only once
		video.load();
	}

	player.driver.play();
	player.updater.start();

	if (!player.hasAudio) {
		dispatchEventAsync(video, 'play');
		if (player.video.readyState >= player.video.HAVE_ENOUGH_DATA) {
			// console.log('onplay');
			dispatchEventAsync(video, 'playing');
		}
	}
}
function pause(forceEvents) {
	// console.log('pause');
	var video = this;
	var player = video[ಠ];

	player.driver.pause();
	player.updater.stop();

	// if it's fullscreen, the developer the native player.pause()
	// This is at the end of pause() because it also
	// needs to make sure that the simulation is paused
	if (video.webkitDisplayingFullscreen) {
		video[ಠpause]();
	}

	if (player.paused && !forceEvents) {
		return;
	}

	player.paused = true;
	if (!player.hasAudio) {
		dispatchEventAsync(video, 'pause');
	}
	if (video.ended) {
		video[ಠevent] = true;
		dispatchEventAsync(video, 'ended');
	}
}

/**
 * SETUP
 */

function addPlayer(video, hasAudio) {
	var player = video[ಠ] = {};
	player.paused = true; // track whether 'pause' events have been fired
	player.hasAudio = hasAudio;
	player.video = video;
	player.updater = intervalometer.frameIntervalometer(update.bind(player));

	if (hasAudio) {
		player.driver = getAudioFromVideo(video);
	} else {
		video.addEventListener('canplay', function () {
			if (!video.paused) {
				// console.log('oncanplay');
				dispatchEventAsync(video, 'playing');
			}
		});
		player.driver = {
			src: video.src || video.currentSrc || 'data:',
			muted: true,
			paused: true,
			pause: function () {
				player.driver.paused = true;
			},
			play: function () {
				player.driver.paused = false;
				// media automatically goes to 0 if .play() is called when it's done
				if (isPlayerEnded(player)) {
					setTime(video, 0);
				}
			},
			get ended() {
				return isPlayerEnded(player);
			}
		};
	}

	// .load() causes the emptied event
	video.addEventListener('emptied', function () {
		// console.log('driver src is', player.driver.src);
		var wasEmpty = !player.driver.src || player.driver.src === 'data:';
		if (player.driver.src && player.driver.src !== video.src) {
			// console.log('src changed to', video.src);
			setTime(video, 0, true);
			player.driver.src = video.src;
			// playing videos will only keep playing if no src was present when .play()’ed
			if (wasEmpty) {
				player.driver.play();
			} else {
				player.updater.stop();
			}
		}
	}, false);

	// stop programmatic player when OS takes over
	video.addEventListener('webkitbeginfullscreen', function () {
		if (!video.paused) {
			// make sure that the <audio> and the syncer/updater are stopped
			video.pause();

			// play video natively
			video[ಠplay]();
		} else if (hasAudio && !player.driver.buffered.length) {
			// if the first play is native,
			// the <audio> needs to be buffered manually
			// so when the fullscreen ends, it can be set to the same current time
			player.driver.load();
		}
	});
	if (hasAudio) {
		video.addEventListener('webkitendfullscreen', function () {
			// sync audio to new video position
			player.driver.currentTime = video.currentTime;
			// console.assert(player.driver.currentTime === video.currentTime, 'Audio not synced');
		});

		// allow seeking
		video.addEventListener('seeking', function () {
			if (lastRequests.indexOf(video.currentTime * 100 | 0 / 100) < 0) {
				// console.log('User-requested seeking');
				player.driver.currentTime = video.currentTime;
			}
		});
	}
}

function overloadAPI(video) {
	var player = video[ಠ];
	video[ಠplay] = video.play;
	video[ಠpause] = video.pause;
	video.play = play;
	video.pause = pause;
	proxyProperty(video, 'paused', player.driver);
	proxyProperty(video, 'muted', player.driver, true);
	proxyProperty(video, 'playbackRate', player.driver, true);
	proxyProperty(video, 'ended', player.driver);
	proxyProperty(video, 'loop', player.driver, true);
	preventEvent(video, 'seeking');
	preventEvent(video, 'seeked');
	preventEvent(video, 'timeupdate', ಠevent, false);
	preventEvent(video, 'ended', ಠevent, false); // prevent occasional native ended events
}

function enableInlineVideo(video, hasAudio, onlyWhitelisted) {
	if ( hasAudio === void 0 ) hasAudio = true;
	if ( onlyWhitelisted === void 0 ) onlyWhitelisted = true;

	if ((onlyWhitelisted && !isWhitelisted) || video[ಠ]) {
		return;
	}
	addPlayer(video, hasAudio);
	overloadAPI(video);
	video.classList.add('IIV');
	if (!hasAudio && video.autoplay) {
		video.play();
	}
	if (!/iPhone|iPod|iPad/.test(navigator.platform)) {
		console.warn('iphone-inline-video is not guaranteed to work in emulated environments');
	}
}

enableInlineVideo.isWhitelisted = isWhitelisted;

module.exports = enableInlineVideo;
},{"intervalometer":1,"poor-mans-symbol":3}],3:[function(require,module,exports){
'use strict';

var index = typeof Symbol === 'undefined' ? function (description) {
	return '@' + (description || '@') + Math.random();
} : Symbol;

module.exports = index;
},{}],4:[function(require,module,exports){
/**
 *
 * (c) Wensheng Yan <yanwsh@gmail.com>
 * Date: 10/30/16
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _Detector = require('../lib/Detector');

var _Detector2 = _interopRequireDefault(_Detector);

var _MobileBuffering = require('../lib/MobileBuffering');

var _MobileBuffering2 = _interopRequireDefault(_MobileBuffering);

var _Util = require('../lib/Util');

var _Util2 = _interopRequireDefault(_Util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var HAVE_CURRENT_DATA = 2;

var BaseCanvas = function BaseCanvas(baseComponent, THREE) {
    var settings = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    return {
        constructor: function init(player, options) {
            this.settings = options;
            //basic settings
            this.width = player.el().offsetWidth, this.height = player.el().offsetHeight;
            this.lon = options.initLon, this.lat = options.initLat, this.phi = 0, this.theta = 0;
            this.videoType = options.videoType;
            this.clickToToggle = options.clickToToggle;
            this.mouseDown = false;
            this.isUserInteracting = false;

            //define render
            this.renderer = new THREE.WebGLRenderer();
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(this.width, this.height);
            this.renderer.autoClear = false;
            this.renderer.setClearColor(0x000000, 1);

            //define texture, on ie 11, we need additional helper canvas to solve rendering issue.
            var video = settings.getTech(player);
            this.supportVideoTexture = _Detector2.default.supportVideoTexture();
            this.liveStreamOnSafari = _Detector2.default.isLiveStreamOnSafari(video);
            if (this.liveStreamOnSafari) this.supportVideoTexture = false;
            if (!this.supportVideoTexture) {
                this.helperCanvas = player.addChild("HelperCanvas", {
                    video: video,
                    width: options.helperCanvas.width ? options.helperCanvas.width : this.width,
                    height: options.helperCanvas.height ? options.helperCanvas.height : this.height
                });
                var context = this.helperCanvas.el();
                this.texture = new THREE.Texture(context);
            } else {
                this.texture = new THREE.Texture(video);
            }

            video.style.visibility = "hidden";

            this.texture.generateMipmaps = false;
            this.texture.minFilter = THREE.LinearFilter;
            this.texture.maxFilter = THREE.LinearFilter;
            this.texture.format = THREE.RGBFormat;

            this.el_ = this.renderer.domElement;
            this.el_.classList.add('vjs-video-canvas');

            options.el = this.el_;
            baseComponent.call(this, player, options);

            this.attachControlEvents();
            this.player().on("play", function () {
                this.time = new Date().getTime();
                this.startAnimation();
            }.bind(this));
        },

        attachControlEvents: function attachControlEvents() {
            this.on('mousemove', this.handleMouseMove.bind(this));
            this.on('touchmove', this.handleTouchMove.bind(this));
            this.on('mousedown', this.handleMouseDown.bind(this));
            this.on('touchstart', this.handleTouchStart.bind(this));
            this.on('mouseup', this.handleMouseUp.bind(this));
            this.on('touchend', this.handleTouchEnd.bind(this));
            if (this.settings.scrollable) {
                this.on('mousewheel', this.handleMouseWheel.bind(this));
                this.on('MozMousePixelScroll', this.handleMouseWheel.bind(this));
            }
            this.on('mouseenter', this.handleMouseEnter.bind(this));
            this.on('mouseleave', this.handleMouseLease.bind(this));
            this.on('dispose', this.handleDispose.bind(this));
        },

        handleDispose: function handleDispose(event) {
            this.off('mousemove', this.handleMouseMove.bind(this));
            this.off('touchmove', this.handleTouchMove.bind(this));
            this.off('mousedown', this.handleMouseDown.bind(this));
            this.off('touchstart', this.handleTouchStart.bind(this));
            this.off('mouseup', this.handleMouseUp.bind(this));
            this.off('touchend', this.handleTouchEnd.bind(this));
            if (this.settings.scrollable) {
                this.off('mousewheel', this.handleMouseWheel.bind(this));
                this.off('MozMousePixelScroll', this.handleMouseWheel.bind(this));
            }
            this.off('mouseenter', this.handleMouseEnter.bind(this));
            this.off('mouseleave', this.handleMouseLease.bind(this));
            this.off('dispose', this.handleDispose.bind(this));
            this.stopAnimation();
        },

        startAnimation: function startAnimation() {
            this.render_animation = true;
            this.animate();
        },

        stopAnimation: function stopAnimation() {
            this.render_animation = false;
            if (this.requestAnimationId) {
                cancelAnimationFrame(this.requestAnimationId);
            }
        },

        handleResize: function handleResize() {
            this.width = this.player().el().offsetWidth, this.height = this.player().el().offsetHeight;
            this.renderer.setSize(this.width, this.height);
        },

        handleMouseUp: function handleMouseUp(event) {
            this.mouseDown = false;
            if (this.clickToToggle) {
                var clientX = event.clientX || event.changedTouches && event.changedTouches[0].clientX;
                var clientY = event.clientY || event.changedTouches && event.changedTouches[0].clientY;
                if (typeof clientX === "undefined" || clientY === "undefined") return;
                var diffX = Math.abs(clientX - this.onPointerDownPointerX);
                var diffY = Math.abs(clientY - this.onPointerDownPointerY);
                if (diffX < 0.1 && diffY < 0.1) this.player().paused() ? this.player().play() : this.player().pause();
            }
        },

        handleMouseDown: function handleMouseDown(event) {
            event.preventDefault();
            var clientX = event.clientX || event.touches && event.touches[0].clientX;
            var clientY = event.clientY || event.touches && event.touches[0].clientY;
            if (typeof clientX === "undefined" || clientY === "undefined") return;
            this.mouseDown = true;
            this.onPointerDownPointerX = clientX;
            this.onPointerDownPointerY = clientY;
            this.onPointerDownLon = this.lon;
            this.onPointerDownLat = this.lat;
        },

        handleTouchStart: function handleTouchStart(event) {
            if (event.touches.length > 1) {
                this.isUserPinch = true;
                this.multiTouchDistance = _Util2.default.getTouchesDistance(event.touches);
            }
            this.handleMouseDown(event);
        },

        handleTouchEnd: function handleTouchEnd(event) {
            this.isUserPinch = false;
            this.handleMouseUp(event);
        },

        handleMouseMove: function handleMouseMove(event) {
            var clientX = event.clientX || event.touches && event.touches[0].clientX;
            var clientY = event.clientY || event.touches && event.touches[0].clientY;
            if (typeof clientX === "undefined" || clientY === "undefined") return;
            if (this.settings.clickAndDrag) {
                if (this.mouseDown) {
                    this.lon = (this.onPointerDownPointerX - clientX) * 0.2 + this.onPointerDownLon;
                    this.lat = (clientY - this.onPointerDownPointerY) * 0.2 + this.onPointerDownLat;
                }
            } else {
                var x = clientX - this.el_.offsetLeft;
                var y = clientY - this.el_.offsetTop;
                this.lon = x / this.width * 430 - 225;
                this.lat = y / this.height * -180 + 90;
            }
        },

        handleTouchMove: function handleTouchMove(event) {
            //handle single touch event,
            if (!this.isUserPinch || event.touches.length <= 1) {
                this.handleMouseMove(event);
            }
        },

        handleMobileOrientation: function handleMobileOrientation(event) {
            if (typeof event.rotationRate === "undefined") return;
            var x = event.rotationRate.alpha;
            var y = event.rotationRate.beta;
            var portrait = typeof event.portrait !== "undefined" ? event.portrait : window.matchMedia("(orientation: portrait)").matches;
            var landscape = typeof event.landscape !== "undefined" ? event.landscape : window.matchMedia("(orientation: landscape)").matches;
            var orientation = event.orientation || window.orientation;

            if (portrait) {
                this.lon = this.lon - y * this.settings.mobileVibrationValue;
                this.lat = this.lat + x * this.settings.mobileVibrationValue;
            } else if (landscape) {
                var orientationDegree = -90;
                if (typeof orientation != "undefined") {
                    orientationDegree = orientation;
                }

                this.lon = orientationDegree == -90 ? this.lon + x * this.settings.mobileVibrationValue : this.lon - x * this.settings.mobileVibrationValue;
                this.lat = orientationDegree == -90 ? this.lat + y * this.settings.mobileVibrationValue : this.lat - y * this.settings.mobileVibrationValue;
            }
        },

        handleMouseWheel: function handleMouseWheel(event) {
            event.stopPropagation();
            event.preventDefault();
        },

        handleMouseEnter: function handleMouseEnter(event) {
            this.isUserInteracting = true;
        },

        handleMouseLease: function handleMouseLease(event) {
            this.isUserInteracting = false;
            if (this.mouseDown) {
                this.mouseDown = false;
            }
        },

        animate: function animate() {
            if (!this.render_animation) return;
            this.requestAnimationId = requestAnimationFrame(this.animate.bind(this));
            if (!this.player().paused()) {
                if (typeof this.texture !== "undefined" && (!this.isPlayOnMobile && this.player().readyState() >= HAVE_CURRENT_DATA || this.isPlayOnMobile && this.player().hasClass("vjs-playing"))) {
                    var ct = new Date().getTime();
                    if (ct - this.time >= 30) {
                        this.texture.needsUpdate = true;
                        this.time = ct;
                    }
                    if (this.isPlayOnMobile) {
                        var currentTime = this.player().currentTime();
                        if (_MobileBuffering2.default.isBuffering(currentTime)) {
                            if (!this.player().hasClass("vjs-panorama-mobile-inline-video-buffering")) {
                                this.player().addClass("vjs-panorama-mobile-inline-video-buffering");
                            }
                        } else {
                            if (this.player().hasClass("vjs-panorama-mobile-inline-video-buffering")) {
                                this.player().removeClass("vjs-panorama-mobile-inline-video-buffering");
                            }
                        }
                    }
                }
            }
            this.render();
        },

        render: function render() {
            if (!this.isUserInteracting) {
                var symbolLat = this.lat > this.settings.initLat ? -1 : 1;
                var symbolLon = this.lon > this.settings.initLon ? -1 : 1;
                if (this.settings.backToVerticalCenter) {
                    this.lat = this.lat > this.settings.initLat - Math.abs(this.settings.returnStepLat) && this.lat < this.settings.initLat + Math.abs(this.settings.returnStepLat) ? this.settings.initLat : this.lat + this.settings.returnStepLat * symbolLat;
                }
                if (this.settings.backToHorizonCenter) {
                    this.lon = this.lon > this.settings.initLon - Math.abs(this.settings.returnStepLon) && this.lon < this.settings.initLon + Math.abs(this.settings.returnStepLon) ? this.settings.initLon : this.lon + this.settings.returnStepLon * symbolLon;
                }
            }
            this.lat = Math.max(this.settings.minLat, Math.min(this.settings.maxLat, this.lat));
            this.lon = Math.max(this.settings.minLon, Math.min(this.settings.maxLon, this.lon));
            this.phi = THREE.Math.degToRad(90 - this.lat);
            this.theta = THREE.Math.degToRad(this.lon);

            if (!this.supportVideoTexture) {
                this.helperCanvas.update();
            }
            this.renderer.clear();
        },

        playOnMobile: function playOnMobile() {
            this.isPlayOnMobile = true;
            if (this.settings.autoMobileOrientation) window.addEventListener('devicemotion', this.handleMobileOrientation.bind(this));
        },

        el: function el() {
            return this.el_;
        }
    };
};

exports.default = BaseCanvas;

},{"../lib/Detector":7,"../lib/MobileBuffering":9,"../lib/Util":13}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _BaseCanvas = require('./BaseCanvas');

var _BaseCanvas2 = _interopRequireDefault(_BaseCanvas);

var _Util = require('./Util');

var _Util2 = _interopRequireDefault(_Util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Created by yanwsh on 4/3/16.
 */

var Canvas = function Canvas(baseComponent, THREE) {
    var settings = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    var parent = (0, _BaseCanvas2.default)(baseComponent, THREE, settings);

    return _Util2.default.extend(parent, {
        constructor: function init(player, options) {
            parent.constructor.call(this, player, options);

            this.VRMode = false;
            //define scene
            this.scene = new THREE.Scene();
            //define camera
            this.camera = new THREE.PerspectiveCamera(options.initFov, this.width / this.height, 1, 2000);
            this.camera.target = new THREE.Vector3(0, 0, 0);

            //define geometry
            var geometry = this.videoType === "equirectangular" ? new THREE.SphereGeometry(500, 60, 40) : new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();
            if (this.videoType === "fisheye") {
                var normals = geometry.attributes.normal.array;
                var uvs = geometry.attributes.uv.array;
                for (var i = 0, l = normals.length / 3; i < l; i++) {
                    var x = normals[i * 3 + 0];
                    var y = normals[i * 3 + 1];
                    var z = normals[i * 3 + 2];

                    var r = Math.asin(Math.sqrt(x * x + z * z) / Math.sqrt(x * x + y * y + z * z)) / Math.PI;
                    if (y < 0) r = 1 - r;
                    var theta = x == 0 && z == 0 ? 0 : Math.acos(x / Math.sqrt(x * x + z * z));
                    if (z < 0) theta = theta * -1;
                    uvs[i * 2 + 0] = -0.8 * r * Math.cos(theta) + 0.5;
                    uvs[i * 2 + 1] = 0.8 * r * Math.sin(theta) + 0.5;
                }
                geometry.rotateX(options.rotateX);
                geometry.rotateY(options.rotateY);
                geometry.rotateZ(options.rotateZ);
            } else if (this.videoType === "dual_fisheye") {
                var _normals = geometry.attributes.normal.array;
                var _uvs = geometry.attributes.uv.array;
                var _l = _normals.length / 3;
                for (var _i = 0; _i < _l / 2; _i++) {
                    var _x2 = _normals[_i * 3 + 0];
                    var _y = _normals[_i * 3 + 1];
                    var _z = _normals[_i * 3 + 2];

                    var _r = _x2 == 0 && _z == 0 ? 1 : Math.acos(_y) / Math.sqrt(_x2 * _x2 + _z * _z) * (2 / Math.PI);
                    _uvs[_i * 2 + 0] = _x2 * options.dualFish.circle1.rx * _r * options.dualFish.circle1.coverX + options.dualFish.circle1.x;
                    _uvs[_i * 2 + 1] = _z * options.dualFish.circle1.ry * _r * options.dualFish.circle1.coverY + options.dualFish.circle1.y;
                }
                for (var _i2 = _l / 2; _i2 < _l; _i2++) {
                    var _x3 = _normals[_i2 * 3 + 0];
                    var _y2 = _normals[_i2 * 3 + 1];
                    var _z2 = _normals[_i2 * 3 + 2];

                    var _r2 = _x3 == 0 && _z2 == 0 ? 1 : Math.acos(-_y2) / Math.sqrt(_x3 * _x3 + _z2 * _z2) * (2 / Math.PI);
                    _uvs[_i2 * 2 + 0] = -_x3 * options.dualFish.circle2.rx * _r2 * options.dualFish.circle2.coverX + options.dualFish.circle2.x;
                    _uvs[_i2 * 2 + 1] = _z2 * options.dualFish.circle2.ry * _r2 * options.dualFish.circle2.coverY + options.dualFish.circle2.y;
                }
                geometry.rotateX(options.rotateX);
                geometry.rotateY(options.rotateY);
                geometry.rotateZ(options.rotateZ);
            }
            geometry.scale(-1, 1, 1);
            //define mesh
            this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture }));
            //this.mesh.scale.x = -1;
            this.scene.add(this.mesh);
        },

        enableVR: function enableVR() {
            this.VRMode = true;
            if (typeof vrHMD !== 'undefined') {
                var eyeParamsL = vrHMD.getEyeParameters('left');
                var eyeParamsR = vrHMD.getEyeParameters('right');

                this.eyeFOVL = eyeParamsL.recommendedFieldOfView;
                this.eyeFOVR = eyeParamsR.recommendedFieldOfView;
            }

            this.cameraL = new THREE.PerspectiveCamera(this.camera.fov, this.width / 2 / this.height, 1, 2000);
            this.cameraR = new THREE.PerspectiveCamera(this.camera.fov, this.width / 2 / this.height, 1, 2000);
        },

        disableVR: function disableVR() {
            this.VRMode = false;
            this.renderer.setViewport(0, 0, this.width, this.height);
            this.renderer.setScissor(0, 0, this.width, this.height);
        },

        handleResize: function handleResize() {
            parent.handleResize.call(this);
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
            if (this.VRMode) {
                this.cameraL.aspect = this.camera.aspect / 2;
                this.cameraR.aspect = this.camera.aspect / 2;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        handleMouseWheel: function handleMouseWheel(event) {
            parent.handleMouseWheel(event);
            // WebKit
            if (event.wheelDeltaY) {
                this.camera.fov -= event.wheelDeltaY * 0.05;
                // Opera / Explorer 9
            } else if (event.wheelDelta) {
                this.camera.fov -= event.wheelDelta * 0.05;
                // Firefox
            } else if (event.detail) {
                this.camera.fov += event.detail * 1.0;
            }
            this.camera.fov = Math.min(this.settings.maxFov, this.camera.fov);
            this.camera.fov = Math.max(this.settings.minFov, this.camera.fov);
            this.camera.updateProjectionMatrix();
            if (this.VRMode) {
                this.cameraL.fov = this.camera.fov;
                this.cameraR.fov = this.camera.fov;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        handleTouchMove: function handleTouchMove(event) {
            parent.handleTouchMove.call(this, event);
            if (this.isUserPinch) {
                var currentDistance = _Util2.default.getTouchesDistance(event.touches);
                event.wheelDeltaY = (currentDistance - this.multiTouchDistance) * 2;
                this.handleMouseWheel.call(this, event);
                this.multiTouchDistance = currentDistance;
            }
        },

        render: function render() {
            parent.render.call(this);
            this.camera.target.x = 500 * Math.sin(this.phi) * Math.cos(this.theta);
            this.camera.target.y = 500 * Math.cos(this.phi);
            this.camera.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
            this.camera.lookAt(this.camera.target);

            if (!this.VRMode) {
                this.renderer.render(this.scene, this.camera);
            } else {
                var viewPortWidth = this.width / 2,
                    viewPortHeight = this.height;
                if (typeof vrHMD !== 'undefined') {
                    this.cameraL.projectionMatrix = _Util2.default.fovToProjection(this.eyeFOVL, true, this.camera.near, this.camera.far);
                    this.cameraR.projectionMatrix = _Util2.default.fovToProjection(this.eyeFOVR, true, this.camera.near, this.camera.far);
                } else {
                    var lonL = this.lon + this.settings.VRGapDegree;
                    var lonR = this.lon - this.settings.VRGapDegree;

                    var thetaL = THREE.Math.degToRad(lonL);
                    var thetaR = THREE.Math.degToRad(lonR);

                    var targetL = _Util2.default.deepCopy(this.camera.target);
                    targetL.x = 500 * Math.sin(this.phi) * Math.cos(thetaL);
                    targetL.z = 500 * Math.sin(this.phi) * Math.sin(thetaL);
                    this.cameraL.lookAt(targetL);

                    var targetR = _Util2.default.deepCopy(this.camera.target);
                    targetR.x = 500 * Math.sin(this.phi) * Math.cos(thetaR);
                    targetR.z = 500 * Math.sin(this.phi) * Math.sin(thetaR);
                    this.cameraR.lookAt(targetR);
                }
                // render left eye
                this.renderer.setViewport(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraL);

                // render right eye
                this.renderer.setViewport(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraR);
            }
        }
    });
};

exports.default = Canvas;

},{"./BaseCanvas":4,"./Util":13}],6:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by tristan gemus on 06/17/2017
 */

var CardboardMessage = function CardboardMessage(baseComponent) {
    var element = document.createElement('div');
    element.className = "vjs-video-notice-cardboard";

    function isPortrait() {
        return typeof event.portrait !== "undefined" ? event.portrait : window.matchMedia("(orientation: portrait)").matches;
    }

    return {
        active: false,

        constructor: function init(player, options) {
            baseComponent.call(this, player, options);
        },

        maybeDisplay: function maybeDisplay(canvas, event) {
            if (!this.active && canvas.VRMode && isPortrait() && player.isFullscreen()) {
                if (!player.paused()) {
                    player.pause();
                }

                this.el().classList.add('active');
                this.active = true;
            } else if (this.active && (!canvas.VRMode || !isPortrait() || !player.isFullscreen())) {
                if (player.paused()) {
                    player.play();
                }

                this.el().classList.remove('active');
                this.active = false;
            }
        },

        el: function el() {
            return element;
        }
    };
};

exports.default = CardboardMessage;

},{}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * @author alteredq / http://alteredqualia.com/
 * @author mr.doob / http://mrdoob.com/
 */

var Detector = {

    canvas: !!window.CanvasRenderingContext2D,
    webgl: function () {

        try {

            var canvas = document.createElement('canvas');return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {

            return false;
        }
    }(),
    workers: !!window.Worker,
    fileapi: window.File && window.FileReader && window.FileList && window.Blob,

    Check_Version: function Check_Version() {
        var rv = -1; // Return value assumes failure.

        if (navigator.appName == 'Microsoft Internet Explorer') {

            var ua = navigator.userAgent,
                re = new RegExp("MSIE ([0-9]{1,}[\\.0-9]{0,})");

            if (re.exec(ua) !== null) {
                rv = parseFloat(RegExp.$1);
            }
        } else if (navigator.appName == "Netscape") {
            /// in IE 11 the navigator.appVersion says 'trident'
            /// in Edge the navigator.appVersion does not say trident
            if (navigator.appVersion.indexOf('Trident') !== -1) rv = 11;else {
                var ua = navigator.userAgent;
                var re = new RegExp("Edge\/([0-9]{1,}[\\.0-9]{0,})");
                if (re.exec(ua) !== null) {
                    rv = parseFloat(RegExp.$1);
                }
            }
        }

        return rv;
    },

    supportVideoTexture: function supportVideoTexture() {
        //ie 11 and edge 12 doesn't support video texture.
        var version = this.Check_Version();
        return version === -1 || version >= 13;
    },

    isLiveStreamOnSafari: function isLiveStreamOnSafari(videoElement) {
        //live stream on safari doesn't support video texture
        var videoSources = [].slice.call(videoElement.querySelectorAll("source"));
        var result = false;
        if (videoElement.src && videoElement.src.indexOf('.m3u8') > -1) {
            videoSources.push({
                src: videoElement.src,
                type: "application/x-mpegURL"
            });
        }
        for (var i = 0; i < videoSources.length; i++) {
            var currentVideoSource = videoSources[i];
            if ((currentVideoSource.type === "application/x-mpegURL" || currentVideoSource.type === "application/vnd.apple.mpegurl") && /(Safari|AppleWebKit)/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor)) {
                result = true;
                break;
            }
        }
        return result;
    },

    getWebGLErrorMessage: function getWebGLErrorMessage() {

        var element = document.createElement('div');
        element.id = 'webgl-error-message';

        if (!this.webgl) {

            element.innerHTML = window.WebGLRenderingContext ? ['Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br />', 'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'].join('\n') : ['Your browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>', 'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'].join('\n');
        }

        return element;
    },

    addGetWebGLMessage: function addGetWebGLMessage(parameters) {

        var parent, id, element;

        parameters = parameters || {};

        parent = parameters.parent !== undefined ? parameters.parent : document.body;
        id = parameters.id !== undefined ? parameters.id : 'oldie';

        element = Detector.getWebGLErrorMessage();
        element.id = id;

        parent.appendChild(element);
    }

};

exports.default = Detector;

},{}],8:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by wensheng.yan on 5/23/16.
 */
var element = document.createElement('canvas');
element.className = "vjs-video-helper-canvas";

var HelperCanvas = function HelperCanvas(baseComponent) {
    return {
        constructor: function init(player, options) {
            this.videoElement = options.video;
            this.width = options.width;
            this.height = options.height;

            element.width = this.width;
            element.height = this.height;
            element.style.display = "none";
            options.el = element;

            this.context = element.getContext('2d');
            this.context.drawImage(this.videoElement, 0, 0, this.width, this.height);
            baseComponent.call(this, player, options);
        },

        getContext: function getContext() {
            return this.context;
        },

        update: function update() {
            this.context.drawImage(this.videoElement, 0, 0, this.width, this.height);
        },

        el: function el() {
            return element;
        }
    };
};

exports.default = HelperCanvas;

},{}],9:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by yanwsh on 6/6/16.
 */
var MobileBuffering = {
    prev_currentTime: 0,
    counter: 0,

    isBuffering: function isBuffering(currentTime) {
        if (currentTime == this.prev_currentTime) this.counter++;else this.counter = 0;
        this.prev_currentTime = currentTime;
        if (this.counter > 10) {
            //not let counter overflow
            this.counter = 10;
            return true;
        }
        return false;
    }
};

exports.default = MobileBuffering;

},{}],10:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/**
 * Created by yanwsh on 4/4/16.
 */

var Notice = function Notice(baseComponent) {
    var element = document.createElement('div');
    element.className = "vjs-video-notice-label";

    return {
        constructor: function init(player, options) {
            if (_typeof(options.NoticeMessage) == "object") {
                element = options.NoticeMessage;
                options.el = options.NoticeMessage;
            } else if (typeof options.NoticeMessage == "string") {
                element.innerHTML = options.NoticeMessage;
                options.el = element;
            }

            baseComponent.call(this, player, options);
        },

        el: function el() {
            return element;
        }
    };
};

exports.default = Notice;

},{}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by tristan gemus on 06/17/2017
 */

var OrientationIcon = function OrientationIcon(baseComponent) {
    var element = document.createElement('div');
    element.className = "vjs-video-orientation-icon";

    function getOrientationDegrees(canvas) {
        var vector = canvas.camera.getWorldDirection();
        var theta = Math.atan2(vector.x, vector.z);
        var rad = Math.PI - theta;
        var deg = THREE.Math.radToDeg(rad);

        return Math.round(deg);
    }

    return {
        userActive: false,

        constructor: function init(player, options) {
            baseComponent.call(this, player, options);
        },

        mouseHandler: function mouseHandler(canvas, e) {
            switch (e.type) {
                case 'mousedown':
                    this.userActive = true;
                    break;
                case 'mouseup':
                    this.userActive = false;
                    break;
                case 'mousemove':
                    this.update(canvas, e);
                    break;
            }
        },

        initEvents: function initEvents(canvas) {
            window.addEventListener('devicemotion', this.update.bind(this, canvas));

            var mouseEvents = ['mousedown', 'mouseup', 'mousemove'];

            for (var key in mouseEvents) {
                window.addEventListener(mouseEvents[key], this.mouseHandler.bind(this, canvas));
            }
        },

        update: function update(canvas, object) {
            var degrees = getOrientationDegrees(canvas) + 90;
            this.el().style.transform = 'rotate(' + degrees + 'deg)';
        },

        el: function el() {
            return element;
        }
    };
};

exports.default = OrientationIcon;

},{}],12:[function(require,module,exports){
/**
 *
 * (c) Wensheng Yan <yanwsh@gmail.com>
 * Date: 10/21/16
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _BaseCanvas = require('./BaseCanvas');

var _BaseCanvas2 = _interopRequireDefault(_BaseCanvas);

var _Util = require('./Util');

var _Util2 = _interopRequireDefault(_Util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ThreeDCanvas = function ThreeDCanvas(baseComponent, THREE) {
    var settings = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    var parent = (0, _BaseCanvas2.default)(baseComponent, THREE, settings);
    return _Util2.default.extend(parent, {
        constructor: function init(player, options) {
            parent.constructor.call(this, player, options);
            //only show left part by default
            this.VRMode = false;
            //define scene
            this.scene = new THREE.Scene();

            var aspectRatio = this.width / this.height;
            //define camera
            this.cameraL = new THREE.PerspectiveCamera(options.initFov, aspectRatio, 1, 2000);
            this.cameraL.target = new THREE.Vector3(0, 0, 0);

            this.cameraR = new THREE.PerspectiveCamera(options.initFov, aspectRatio / 2, 1, 2000);
            this.cameraR.position.set(1000, 0, 0);
            this.cameraR.target = new THREE.Vector3(1000, 0, 0);

            var geometryL = new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();
            var geometryR = new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();

            var uvsL = geometryL.attributes.uv.array;
            var normalsL = geometryL.attributes.normal.array;
            for (var i = 0; i < normalsL.length / 3; i++) {
                uvsL[i * 2 + 1] = uvsL[i * 2 + 1] / 2;
            }

            var uvsR = geometryR.attributes.uv.array;
            var normalsR = geometryR.attributes.normal.array;
            for (var i = 0; i < normalsR.length / 3; i++) {
                uvsR[i * 2 + 1] = uvsR[i * 2 + 1] / 2 + 0.5;
            }

            geometryL.scale(-1, 1, 1);
            geometryR.scale(-1, 1, 1);

            this.meshL = new THREE.Mesh(geometryL, new THREE.MeshBasicMaterial({ map: this.texture }));

            this.meshR = new THREE.Mesh(geometryR, new THREE.MeshBasicMaterial({ map: this.texture }));
            this.meshR.position.set(1000, 0, 0);

            this.scene.add(this.meshL);

            if (options.callback) options.callback();
        },

        handleResize: function handleResize() {
            parent.handleResize.call(this);
            var aspectRatio = this.width / this.height;
            if (!this.VRMode) {
                this.cameraL.aspect = aspectRatio;
                this.cameraL.updateProjectionMatrix();
            } else {
                aspectRatio /= 2;
                this.cameraL.aspect = aspectRatio;
                this.cameraR.aspect = aspectRatio;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        handleMouseWheel: function handleMouseWheel(event) {
            parent.handleMouseWheel(event);
            // WebKit
            if (event.wheelDeltaY) {
                this.cameraL.fov -= event.wheelDeltaY * 0.05;
                // Opera / Explorer 9
            } else if (event.wheelDelta) {
                this.cameraL.fov -= event.wheelDelta * 0.05;
                // Firefox
            } else if (event.detail) {
                this.cameraL.fov += event.detail * 1.0;
            }
            this.cameraL.fov = Math.min(this.settings.maxFov, this.cameraL.fov);
            this.cameraL.fov = Math.max(this.settings.minFov, this.cameraL.fov);
            this.cameraL.updateProjectionMatrix();
            if (this.VRMode) {
                this.cameraR.fov = this.cameraL.fov;
                this.cameraR.updateProjectionMatrix();
            }
        },

        enableVR: function enableVR() {
            this.VRMode = true;
            this.scene.add(this.meshR);
            this.handleResize();
        },

        disableVR: function disableVR() {
            this.VRMode = false;
            this.scene.remove(this.meshR);
            this.handleResize();
        },

        render: function render() {
            parent.render.call(this);
            this.cameraL.target.x = 500 * Math.sin(this.phi) * Math.cos(this.theta);
            this.cameraL.target.y = 500 * Math.cos(this.phi);
            this.cameraL.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
            this.cameraL.lookAt(this.cameraL.target);

            if (this.VRMode) {
                var viewPortWidth = this.width / 2,
                    viewPortHeight = this.height;
                this.cameraR.target.x = 1000 + 500 * Math.sin(this.phi) * Math.cos(this.theta);
                this.cameraR.target.y = 500 * Math.cos(this.phi);
                this.cameraR.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
                this.cameraR.lookAt(this.cameraR.target);

                // render left eye
                this.renderer.setViewport(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraL);

                // render right eye
                this.renderer.setViewport(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraR);
            } else {
                this.renderer.render(this.scene, this.cameraL);
            }
        }
    });
};

exports.default = ThreeDCanvas;

},{"./BaseCanvas":4,"./Util":13}],13:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by wensheng.yan on 4/4/16.
 */
function whichTransitionEvent() {
    var t;
    var el = document.createElement('fakeelement');
    var transitions = {
        'transition': 'transitionend',
        'OTransition': 'oTransitionEnd',
        'MozTransition': 'transitionend',
        'WebkitTransition': 'webkitTransitionEnd'
    };

    for (t in transitions) {
        if (el.style[t] !== undefined) {
            return transitions[t];
        }
    }
}

function mobileAndTabletcheck() {
    var check = false;
    (function (a) {
        if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true;
    })(navigator.userAgent || navigator.vendor || window.opera);
    return check;
}

function isIos() {
    return (/iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
}

function isRealIphone() {
    return (/iPhone|iPod/i.test(navigator.platform)
    );
}

//adopt code from: https://github.com/MozVR/vr-web-examples/blob/master/threejs-vr-boilerplate/js/VREffect.js
function fovToNDCScaleOffset(fov) {
    var pxscale = 2.0 / (fov.leftTan + fov.rightTan);
    var pxoffset = (fov.leftTan - fov.rightTan) * pxscale * 0.5;
    var pyscale = 2.0 / (fov.upTan + fov.downTan);
    var pyoffset = (fov.upTan - fov.downTan) * pyscale * 0.5;
    return { scale: [pxscale, pyscale], offset: [pxoffset, pyoffset] };
}

function fovPortToProjection(fov, rightHanded, zNear, zFar) {

    rightHanded = rightHanded === undefined ? true : rightHanded;
    zNear = zNear === undefined ? 0.01 : zNear;
    zFar = zFar === undefined ? 10000.0 : zFar;

    var handednessScale = rightHanded ? -1.0 : 1.0;

    // start with an identity matrix
    var mobj = new THREE.Matrix4();
    var m = mobj.elements;

    // and with scale/offset info for normalized device coords
    var scaleAndOffset = fovToNDCScaleOffset(fov);

    // X result, map clip edges to [-w,+w]
    m[0 * 4 + 0] = scaleAndOffset.scale[0];
    m[0 * 4 + 1] = 0.0;
    m[0 * 4 + 2] = scaleAndOffset.offset[0] * handednessScale;
    m[0 * 4 + 3] = 0.0;

    // Y result, map clip edges to [-w,+w]
    // Y offset is negated because this proj matrix transforms from world coords with Y=up,
    // but the NDC scaling has Y=down (thanks D3D?)
    m[1 * 4 + 0] = 0.0;
    m[1 * 4 + 1] = scaleAndOffset.scale[1];
    m[1 * 4 + 2] = -scaleAndOffset.offset[1] * handednessScale;
    m[1 * 4 + 3] = 0.0;

    // Z result (up to the app)
    m[2 * 4 + 0] = 0.0;
    m[2 * 4 + 1] = 0.0;
    m[2 * 4 + 2] = zFar / (zNear - zFar) * -handednessScale;
    m[2 * 4 + 3] = zFar * zNear / (zNear - zFar);

    // W result (= Z in)
    m[3 * 4 + 0] = 0.0;
    m[3 * 4 + 1] = 0.0;
    m[3 * 4 + 2] = handednessScale;
    m[3 * 4 + 3] = 0.0;

    mobj.transpose();

    return mobj;
}

function fovToProjection(fov, rightHanded, zNear, zFar) {
    var DEG2RAD = Math.PI / 180.0;

    var fovPort = {
        upTan: Math.tan(fov.upDegrees * DEG2RAD),
        downTan: Math.tan(fov.downDegrees * DEG2RAD),
        leftTan: Math.tan(fov.leftDegrees * DEG2RAD),
        rightTan: Math.tan(fov.rightDegrees * DEG2RAD)
    };

    return fovPortToProjection(fovPort, rightHanded, zNear, zFar);
}

function extend(superClass) {
    var subClassMethods = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    for (var method in superClass) {
        if (superClass.hasOwnProperty(method) && !subClassMethods.hasOwnProperty(method)) {
            subClassMethods[method] = superClass[method];
        }
    }
    return subClassMethods;
}

function deepCopy(obj) {
    var to = {};

    for (var name in obj) {
        to[name] = obj[name];
    }

    return to;
}

function getTouchesDistance(touches) {
    return Math.sqrt((touches[0].clientX - touches[1].clientX) * (touches[0].clientX - touches[1].clientX) + (touches[0].clientY - touches[1].clientY) * (touches[0].clientY - touches[1].clientY));
}

exports.default = {
    whichTransitionEvent: whichTransitionEvent,
    mobileAndTabletcheck: mobileAndTabletcheck,
    isIos: isIos,
    isRealIphone: isRealIphone,
    fovToProjection: fovToProjection,
    extend: extend,
    deepCopy: deepCopy,
    getTouchesDistance: getTouchesDistance
};

},{}],14:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by yanwsh on 8/13/16.
 */

var VRButton = function VRButton(ButtonComponent) {
    return {
        constructor: function init(player, options) {
            ButtonComponent.call(this, player, options);
        },

        buildCSSClass: function buildCSSClass() {
            return "vjs-VR-control " + ButtonComponent.prototype.buildCSSClass.call(this);
        },

        handleClick: function handleClick() {
            var canvas = this.player().getChild("Canvas");
            !canvas.VRMode ? canvas.enableVR() : canvas.disableVR();
            canvas.VRMode ? this.addClass("enable") : this.removeClass("enable");
            canvas.VRMode ? this.player().trigger('VRModeOn') : this.player().trigger('VRModeOff');
        },

        controlText_: "VR"
    };
};

exports.default = VRButton;

},{}],15:[function(require,module,exports){
/**
 * Created by yanwsh on 4/3/16.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _Util = require('./lib/Util');

var _Util2 = _interopRequireDefault(_Util);

var _Detector = require('./lib/Detector');

var _Detector2 = _interopRequireDefault(_Detector);

var _iphoneInlineVideo = require('iphone-inline-video');

var _iphoneInlineVideo2 = _interopRequireDefault(_iphoneInlineVideo);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var runOnMobile = _Util2.default.mobileAndTabletcheck();

// Default options for the plugin.
var defaults = {
    clickAndDrag: runOnMobile,
    showNotice: true,
    NoticeMessage: "Please use your mouse drag and drop the video.",
    autoHideNotice: 3000,
    //limit the video size when user scroll.
    scrollable: true,
    initFov: 75,
    maxFov: 105,
    minFov: 51,
    //initial position for the video
    initLat: 0,
    initLon: -180,
    //A float value back to center when mouse out the canvas. The higher, the faster.
    returnStepLat: 0.5,
    returnStepLon: 2,
    backToVerticalCenter: !runOnMobile,
    backToHorizonCenter: !runOnMobile,
    clickToToggle: false,

    //limit viewable zoom
    minLat: -85,
    maxLat: 85,

    minLon: -Infinity,
    maxLon: Infinity,

    videoType: "equirectangular",

    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,

    autoMobileOrientation: false,
    mobileVibrationValue: _Util2.default.isIos() ? 0.022 : 1,

    VREnable: true,
    VRGapDegree: 2.5,

    closePanorama: false,

    helperCanvas: {},

    dualFish: {
        width: 1920,
        height: 1080,
        circle1: {
            x: 0.240625,
            y: 0.553704,
            rx: 0.23333,
            ry: 0.43148,
            coverX: 0.913,
            coverY: 0.9
        },
        circle2: {
            x: 0.757292,
            y: 0.553704,
            rx: 0.232292,
            ry: 0.4296296,
            coverX: 0.913,
            coverY: 0.9308
        }
    }
};

function playerResize(player) {
    var canvas = player.getChild('Canvas');
    return function () {
        player.el().style.width = window.innerWidth + "px";
        player.el().style.height = window.innerHeight + "px";
        canvas.handleResize();
    };
}

function fullscreenOnIOS(player, clickFn) {
    var resizeFn = playerResize(player);
    player.controlBar.fullscreenToggle.off("tap", clickFn);
    player.controlBar.fullscreenToggle.on("tap", function fullscreen() {
        var canvas = player.getChild('Canvas');
        if (!player.isFullscreen()) {
            //set to fullscreen
            player.isFullscreen(true);
            player.enterFullWindow();
            resizeFn();
            window.addEventListener("devicemotion", resizeFn);
        } else {
            player.isFullscreen(false);
            player.exitFullWindow();
            player.el().style.width = "";
            player.el().style.height = "";
            canvas.handleResize();
            window.removeEventListener("devicemotion", resizeFn);
        }
    });
}

/**
 * Function to invoke when the player is ready.
 *
 * This is a great place for your plugin to initialize itself. When this
 * function is called, the player will have its DOM and child components
 * in place.
 *
 * @function onPlayerReady
 * @param    {Player} player
 * @param    {Object} [options={}]
 */
var onPlayerReady = function onPlayerReady(player, options, settings) {
    player.addClass('vjs-panorama');
    if (!_Detector2.default.webgl) {
        PopupNotification(player, {
            NoticeMessage: _Detector2.default.getWebGLErrorMessage(),
            autoHideNotice: options.autoHideNotice
        });
        if (options.callback) {
            options.callback();
        }
        return;
    }
    player.addChild('Canvas', _Util2.default.deepCopy(options));
    var canvas = player.getChild('Canvas');
    if (runOnMobile) {
        var videoElement = settings.getTech(player);
        if (_Util2.default.isRealIphone()) {
            //ios 10 support play video inline
            videoElement.setAttribute("playsinline", "");
            (0, _iphoneInlineVideo2.default)(videoElement, true);
        }
        if (_Util2.default.isIos()) {
            fullscreenOnIOS(player, settings.getFullscreenToggleClickFn(player));
        }
        player.addClass("vjs-panorama-mobile-inline-video");
        player.removeClass("vjs-using-native-controls");
        canvas.playOnMobile();
    }

    var cardboard = player.addChild('CardboardMessage', options);

    window.addEventListener('devicemotion', cardboard.maybeDisplay.bind(cardboard, canvas));
    player.on('VRModeOn', cardboard.maybeDisplay.bind(cardboard, canvas));
    player.on('VRModeOff', cardboard.maybeDisplay.bind(cardboard, canvas));

    var orientationIcon = player.addChild('OrientationIcon', options);
    orientationIcon.initEvents(canvas);
    // window.addEventListener('devicemotion', orientationIcon.update.bind(orientationIcon, canvas));

    if (options.showNotice) {
        player.on("playing", function () {
            PopupNotification(player, _Util2.default.deepCopy(options));
        });
    }
    if (options.VREnable) {
        player.controlBar.addChild('VRButton', {}, player.controlBar.children().length - 1);
    }
    canvas.hide();
    player.on("play", function () {
        canvas.show();
    });
    player.on("fullscreenchange", function () {
        canvas.handleResize();
    });
    if (options.callback) options.callback();
};

var PopupNotification = function PopupNotification(player) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
        NoticeMessage: ""
    };

    var notice = player.addChild('Notice', options);

    if (options.autoHideNotice > 0) {
        setTimeout(function () {
            notice.addClass("vjs-video-notice-fadeOut");
            var transitionEvent = _Util2.default.whichTransitionEvent();
            var hide = function hide() {
                notice.hide();
                notice.removeClass("vjs-video-notice-fadeOut");
                notice.off(transitionEvent, hide);
            };
            notice.on(transitionEvent, hide);
        }, options.autoHideNotice);
    }
};

var plugin = function plugin() {
    var settings = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    /**
     * A video.js plugin.
     *
     * In the plugin function, the value of `this` is a video.js `Player`
     * instance. You cannot rely on the player being in a "ready" state here,
     * depending on how the plugin is invoked. This may or may not be important
     * to you; if not, remove the wait for "ready"!
     *
     * @function panorama
     * @param    {Object} [options={}]
     *           An object of options left to the plugin author to define.
     */
    var videoTypes = ["equirectangular", "fisheye", "3dVideo", "dual_fisheye"];
    var panorama = function panorama(options) {
        var _this = this;

        if (settings.mergeOption) options = settings.mergeOption(defaults, options);
        if (typeof settings._init === "undefined" || typeof settings._init !== "function") {
            console.error("plugin must implement init function().");
            return;
        }
        if (videoTypes.indexOf(options.videoType) == -1) options.videoType = defaults.videoType;
        settings._init(options);
        /* implement callback function when videojs is ready */
        this.ready(function () {
            onPlayerReady(_this, options, settings);
        });
    };

    // Include the version number.
    panorama.VERSION = '0.1.6';

    return panorama;
};

exports.default = plugin;

},{"./lib/Detector":7,"./lib/Util":13,"iphone-inline-video":2}],16:[function(require,module,exports){
'use strict';

var _Canvas = require('./lib/Canvas');

var _Canvas2 = _interopRequireDefault(_Canvas);

var _ThreeCanvas = require('./lib/ThreeCanvas');

var _ThreeCanvas2 = _interopRequireDefault(_ThreeCanvas);

var _Notice = require('./lib/Notice');

var _Notice2 = _interopRequireDefault(_Notice);

var _HelperCanvas = require('./lib/HelperCanvas');

var _HelperCanvas2 = _interopRequireDefault(_HelperCanvas);

var _VRButton = require('./lib/VRButton');

var _VRButton2 = _interopRequireDefault(_VRButton);

var _CardboardMessage = require('./lib/CardboardMessage');

var _CardboardMessage2 = _interopRequireDefault(_CardboardMessage);

var _OrientationIcon = require('./lib/OrientationIcon');

var _OrientationIcon2 = _interopRequireDefault(_OrientationIcon);

var _plugin = require('./plugin');

var _plugin2 = _interopRequireDefault(_plugin);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function getTech(player) {
    return player.tech({ IWillNotUseThisInPlugins: true }).el();
}

function getFullscreenToggleClickFn(player) {
    return player.controlBar.fullscreenToggle.handleClick;
}

var component = videojs.getComponent('Component');

var notice = (0, _Notice2.default)(component);
videojs.registerComponent('Notice', videojs.extend(component, notice));

var helperCanvas = (0, _HelperCanvas2.default)(component);
videojs.registerComponent('HelperCanvas', videojs.extend(component, helperCanvas));

var button = videojs.getComponent("Button");
var vrBtn = (0, _VRButton2.default)(button);
videojs.registerComponent('VRButton', videojs.extend(button, vrBtn));

var cardboardMessage = (0, _CardboardMessage2.default)(component);
videojs.registerComponent('CardboardMessage', videojs.extend(component, cardboardMessage));

var orientationIcon = (0, _OrientationIcon2.default)(component);
videojs.registerComponent('OrientationIcon', videojs.extend(component, orientationIcon));

// Register the plugin with video.js.
videojs.plugin('panorama', (0, _plugin2.default)({
    _init: function _init(options) {
        var canvas = options.videoType !== "3dVideo" ? (0, _Canvas2.default)(component, window.THREE, {
            getTech: getTech
        }) : (0, _ThreeCanvas2.default)(component, window.THREE, {
            getTech: getTech
        });
        videojs.registerComponent('Canvas', videojs.extend(component, canvas));
    },
    mergeOption: function mergeOption(defaults, options) {
        return videojs.mergeOptions(defaults, options);
    },
    getTech: getTech,
    getFullscreenToggleClickFn: getFullscreenToggleClickFn
}));

},{"./lib/Canvas":5,"./lib/CardboardMessage":6,"./lib/HelperCanvas":8,"./lib/Notice":10,"./lib/OrientationIcon":11,"./lib/ThreeCanvas":12,"./lib/VRButton":14,"./plugin":15}]},{},[16])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaW50ZXJ2YWxvbWV0ZXIvZGlzdC9pbnRlcnZhbG9tZXRlci5jb21tb24tanMuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwibm9kZV9tb2R1bGVzL3Bvb3ItbWFucy1zeW1ib2wvZGlzdC9wb29yLW1hbnMtc3ltYm9sLmNvbW1vbi1qcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9CYXNlQ2FudmFzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9DYXJkYm9hcmRNZXNzYWdlLmpzIiwic3JjL3NjcmlwdHMvbGliL0RldGVjdG9yLmpzIiwic3JjL3NjcmlwdHMvbGliL0hlbHBlckNhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9Nb2JpbGVCdWZmZXJpbmcuanMiLCJzcmMvc2NyaXB0cy9saWIvTm90aWNlLmpzIiwic3JjL3NjcmlwdHMvbGliL09yaWVudGF0aW9uSWNvbi5qcyIsInNyYy9zY3JpcHRzL2xpYi9UaHJlZUNhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvbGliL1ZSQnV0dG9uLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y1LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7Ozs7Ozs7O0FBUUE7Ozs7OztBQUVBOzs7O0FBQ0E7Ozs7QUFDQTs7Ozs7O0FBRUEsSUFBTSxvQkFBb0IsQ0FBMUI7O0FBRUEsSUFBSSxhQUFhLFNBQWIsVUFBYSxDQUFVLGFBQVYsRUFB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Y3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qISBucG0uaW0vaW50ZXJ2YWxvbWV0ZXIgKi9cbid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsICdfX2VzTW9kdWxlJywgeyB2YWx1ZTogdHJ1ZSB9KTtcblxuZnVuY3Rpb24gaW50ZXJ2YWxvbWV0ZXIoY2IsIHJlcXVlc3QsIGNhbmNlbCwgcmVxdWVzdFBhcmFtZXRlcikge1xuXHR2YXIgcmVxdWVzdElkO1xuXHR2YXIgcHJldmlvdXNMb29wVGltZTtcblx0ZnVuY3Rpb24gbG9vcChub3cpIHtcblx0XHQvLyBtdXN0IGJlIHJlcXVlc3RlZCBiZWZvcmUgY2IoKSBiZWNhdXNlIHRoYXQgbWlnaHQgY2FsbCAuc3RvcCgpXG5cdFx0cmVxdWVzdElkID0gcmVxdWVzdChsb29wLCByZXF1ZXN0UGFyYW1ldGVyKTtcblxuXHRcdC8vIGNhbGxlZCB3aXRoIFwibXMgc2luY2UgbGFzdCBjYWxsXCIuIDAgb24gc3RhcnQoKVxuXHRcdGNiKG5vdyAtIChwcmV2aW91c0xvb3BUaW1lIHx8IG5vdykpO1xuXG5cdFx0cHJldmlvdXNMb29wVGltZSA9IG5vdztcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0OiBmdW5jdGlvbiBzdGFydCgpIHtcblx0XHRcdGlmICghcmVxdWVzdElkKSB7IC8vIHByZXZlbnQgZG91YmxlIHN0YXJ0c1xuXHRcdFx0XHRsb29wKDApO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0c3RvcDogZnVuY3Rpb24gc3RvcCgpIHtcblx0XHRcdGNhbmNlbChyZXF1ZXN0SWQpO1xuXHRcdFx0cmVxdWVzdElkID0gbnVsbDtcblx0XHRcdHByZXZpb3VzTG9vcFRpbWUgPSAwO1xuXHRcdH1cblx0fTtcbn1cblxuZnVuY3Rpb24gZnJhbWVJbnRlcnZhbG9tZXRlcihjYikge1xuXHRyZXR1cm4gaW50ZXJ2YWxvbWV0ZXIoY2IsIHJlcXVlc3RBbmltYXRpb25GcmFtZSwgY2FuY2VsQW5pbWF0aW9uRnJhbWUpO1xufVxuXG5mdW5jdGlvbiB0aW1lckludGVydmFsb21ldGVyKGNiLCBkZWxheSkge1xuXHRyZXR1cm4gaW50ZXJ2YWxvbWV0ZXIoY2IsIHNldFRpbWVvdXQsIGNsZWFyVGltZW91dCwgZGVsYXkpO1xufVxuXG5leHBvcnRzLmludGVydmFsb21ldGVyID0gaW50ZXJ2YWxvbWV0ZXI7XG5leHBvcnRzLmZyYW1lSW50ZXJ2YWxvbWV0ZXIgPSBmcmFtZUludGVydmFsb21ldGVyO1xuZXhwb3J0cy50aW1lckludGVydmFsb21ldGVyID0gdGltZXJJbnRlcnZhbG9tZXRlcjsiLCIvKiEgbnBtLmltL2lwaG9uZS1pbmxpbmUtdmlkZW8gKi9cbid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gX2ludGVyb3BEZWZhdWx0IChleCkgeyByZXR1cm4gKGV4ICYmICh0eXBlb2YgZXggPT09ICdvYmplY3QnKSAmJiAnZGVmYXVsdCcgaW4gZXgpID8gZXhbJ2RlZmF1bHQnXSA6IGV4OyB9XG5cbnZhciBTeW1ib2wgPSBfaW50ZXJvcERlZmF1bHQocmVxdWlyZSgncG9vci1tYW5zLXN5bWJvbCcpKTtcbnZhciBpbnRlcnZhbG9tZXRlciA9IHJlcXVpcmUoJ2ludGVydmFsb21ldGVyJyk7XG5cbmZ1bmN0aW9uIHByZXZlbnRFdmVudChlbGVtZW50LCBldmVudE5hbWUsIHRvZ2dsZVByb3BlcnR5LCBwcmV2ZW50V2l0aFByb3BlcnR5KSB7XG5cdGZ1bmN0aW9uIGhhbmRsZXIoZSkge1xuXHRcdGlmIChCb29sZWFuKGVsZW1lbnRbdG9nZ2xlUHJvcGVydHldKSA9PT0gQm9vbGVhbihwcmV2ZW50V2l0aFByb3BlcnR5KSkge1xuXHRcdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdC8vIGNvbnNvbGUubG9nKGV2ZW50TmFtZSwgJ3ByZXZlbnRlZCBvbicsIGVsZW1lbnQpO1xuXHRcdH1cblx0XHRkZWxldGUgZWxlbWVudFt0b2dnbGVQcm9wZXJ0eV07XG5cdH1cblx0ZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgaGFuZGxlciwgZmFsc2UpO1xuXG5cdC8vIFJldHVybiBoYW5kbGVyIHRvIGFsbG93IHRvIGRpc2FibGUgdGhlIHByZXZlbnRpb24uIFVzYWdlOlxuXHQvLyBjb25zdCBwcmV2ZW50aW9uSGFuZGxlciA9IHByZXZlbnRFdmVudChlbCwgJ2NsaWNrJyk7XG5cdC8vIGVsLnJlbW92ZUV2ZW50SGFuZGxlcignY2xpY2snLCBwcmV2ZW50aW9uSGFuZGxlcik7XG5cdHJldHVybiBoYW5kbGVyO1xufVxuXG5mdW5jdGlvbiBwcm94eVByb3BlcnR5KG9iamVjdCwgcHJvcGVydHlOYW1lLCBzb3VyY2VPYmplY3QsIGNvcHlGaXJzdCkge1xuXHRmdW5jdGlvbiBnZXQoKSB7XG5cdFx0cmV0dXJuIHNvdXJjZU9iamVjdFtwcm9wZXJ0eU5hbWVdO1xuXHR9XG5cdGZ1bmN0aW9uIHNldCh2YWx1ZSkge1xuXHRcdHNvdXJjZU9iamVjdFtwcm9wZXJ0eU5hbWVdID0gdmFsdWU7XG5cdH1cblxuXHRpZiAoY29weUZpcnN0KSB7XG5cdFx0c2V0KG9iamVjdFtwcm9wZXJ0eU5hbWVdKTtcblx0fVxuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5TmFtZSwge2dldDogZ2V0LCBzZXQ6IHNldH0pO1xufVxuXG5mdW5jdGlvbiBwcm94eUV2ZW50KG9iamVjdCwgZXZlbnROYW1lLCBzb3VyY2VPYmplY3QpIHtcblx0c291cmNlT2JqZWN0LmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBmdW5jdGlvbiAoKSB7IHJldHVybiBvYmplY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoZXZlbnROYW1lKSk7IH0pO1xufVxuXG5mdW5jdGlvbiBkaXNwYXRjaEV2ZW50QXN5bmMoZWxlbWVudCwgdHlwZSkge1xuXHRQcm9taXNlLnJlc29sdmUoKS50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KHR5cGUpKTtcblx0fSk7XG59XG5cbi8vIGlPUyAxMCBhZGRzIHN1cHBvcnQgZm9yIG5hdGl2ZSBpbmxpbmUgcGxheWJhY2sgKyBzaWxlbnQgYXV0b3BsYXlcbnZhciBpc1doaXRlbGlzdGVkID0gJ29iamVjdC1maXQnIGluIGRvY3VtZW50LmhlYWQuc3R5bGUgJiYgL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSAmJiAhbWF0Y2hNZWRpYSgnKC13ZWJraXQtdmlkZW8tcGxheWFibGUtaW5saW5lKScpLm1hdGNoZXM7XG5cbnZhciDgsqAgPSBTeW1ib2woKTtcbnZhciDgsqBldmVudCA9IFN5bWJvbCgpO1xudmFyIOCyoHBsYXkgPSBTeW1ib2woJ25hdGl2ZXBsYXknKTtcbnZhciDgsqBwYXVzZSA9IFN5bWJvbCgnbmF0aXZlcGF1c2UnKTtcblxuLyoqXG4gKiBVVElMU1xuICovXG5cbmZ1bmN0aW9uIGdldEF1ZGlvRnJvbVZpZGVvKHZpZGVvKSB7XG5cdHZhciBhdWRpbyA9IG5ldyBBdWRpbygpO1xuXHRwcm94eUV2ZW50KHZpZGVvLCAncGxheScsIGF1ZGlvKTtcblx0cHJveHlFdmVudCh2aWRlbywgJ3BsYXlpbmcnLCBhdWRpbyk7XG5cdHByb3h5RXZlbnQodmlkZW8sICdwYXVzZScsIGF1ZGlvKTtcblx0YXVkaW8uY3Jvc3NPcmlnaW4gPSB2aWRlby5jcm9zc09yaWdpbjtcblxuXHQvLyAnZGF0YTonIGNhdXNlcyBhdWRpby5uZXR3b3JrU3RhdGUgPiAwXG5cdC8vIHdoaWNoIHRoZW4gYWxsb3dzIHRvIGtlZXAgPGF1ZGlvPiBpbiBhIHJlc3VtYWJsZSBwbGF5aW5nIHN0YXRlXG5cdC8vIGkuZS4gb25jZSB5b3Ugc2V0IGEgcmVhbCBzcmMgaXQgd2lsbCBrZWVwIHBsYXlpbmcgaWYgaXQgd2FzIGlmIC5wbGF5KCkgd2FzIGNhbGxlZFxuXHRhdWRpby5zcmMgPSB2aWRlby5zcmMgfHwgdmlkZW8uY3VycmVudFNyYyB8fCAnZGF0YTonO1xuXG5cdC8vIGlmIChhdWRpby5zcmMgPT09ICdkYXRhOicpIHtcblx0Ly8gICBUT0RPOiB3YWl0IGZvciB2aWRlbyB0byBiZSBzZWxlY3RlZFxuXHQvLyB9XG5cdHJldHVybiBhdWRpbztcbn1cblxudmFyIGxhc3RSZXF1ZXN0cyA9IFtdO1xudmFyIHJlcXVlc3RJbmRleCA9IDA7XG52YXIgbGFzdFRpbWV1cGRhdGVFdmVudDtcblxuZnVuY3Rpb24gc2V0VGltZSh2aWRlbywgdGltZSwgcmVtZW1iZXJPbmx5KSB7XG5cdC8vIGFsbG93IG9uZSB0aW1ldXBkYXRlIGV2ZW50IGV2ZXJ5IDIwMCsgbXNcblx0aWYgKChsYXN0VGltZXVwZGF0ZUV2ZW50IHx8IDApICsgMjAwIDwgRGF0ZS5ub3coKSkge1xuXHRcdHZpZGVvW+CyoGV2ZW50XSA9IHRydWU7XG5cdFx0bGFzdFRpbWV1cGRhdGVFdmVudCA9IERhdGUubm93KCk7XG5cdH1cblx0aWYgKCFyZW1lbWJlck9ubHkpIHtcblx0XHR2aWRlby5jdXJyZW50VGltZSA9IHRpbWU7XG5cdH1cblx0bGFzdFJlcXVlc3RzWysrcmVxdWVzdEluZGV4ICUgM10gPSB0aW1lICogMTAwIHwgMCAvIDEwMDtcbn1cblxuZnVuY3Rpb24gaXNQbGF5ZXJFbmRlZChwbGF5ZXIpIHtcblx0cmV0dXJuIHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPj0gcGxheWVyLnZpZGVvLmR1cmF0aW9uO1xufVxuXG5mdW5jdGlvbiB1cGRhdGUodGltZURpZmYpIHtcblx0dmFyIHBsYXllciA9IHRoaXM7XG5cdC8vIGNvbnNvbGUubG9nKCd1cGRhdGUnLCBwbGF5ZXIudmlkZW8ucmVhZHlTdGF0ZSwgcGxheWVyLnZpZGVvLm5ldHdvcmtTdGF0ZSwgcGxheWVyLmRyaXZlci5yZWFkeVN0YXRlLCBwbGF5ZXIuZHJpdmVyLm5ldHdvcmtTdGF0ZSwgcGxheWVyLmRyaXZlci5wYXVzZWQpO1xuXHRpZiAocGxheWVyLnZpZGVvLnJlYWR5U3RhdGUgPj0gcGxheWVyLnZpZGVvLkhBVkVfRlVUVVJFX0RBVEEpIHtcblx0XHRpZiAoIXBsYXllci5oYXNBdWRpbykge1xuXHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHBsYXllci52aWRlby5jdXJyZW50VGltZSArICgodGltZURpZmYgKiBwbGF5ZXIudmlkZW8ucGxheWJhY2tSYXRlKSAvIDEwMDApO1xuXHRcdFx0aWYgKHBsYXllci52aWRlby5sb29wICYmIGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gMDtcblx0XHRcdH1cblx0XHR9XG5cdFx0c2V0VGltZShwbGF5ZXIudmlkZW8sIHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUpO1xuXHR9IGVsc2UgaWYgKHBsYXllci52aWRlby5uZXR3b3JrU3RhdGUgPT09IHBsYXllci52aWRlby5ORVRXT1JLX0lETEUgJiYgIXBsYXllci52aWRlby5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHQvLyB0aGlzIHNob3VsZCBoYXBwZW4gd2hlbiB0aGUgc291cmNlIGlzIGF2YWlsYWJsZSBidXQ6XG5cdFx0Ly8gLSBpdCdzIHBvdGVudGlhbGx5IHBsYXlpbmcgKC5wYXVzZWQgPT09IGZhbHNlKVxuXHRcdC8vIC0gaXQncyBub3QgcmVhZHkgdG8gcGxheVxuXHRcdC8vIC0gaXQncyBub3QgbG9hZGluZ1xuXHRcdC8vIElmIGl0IGhhc0F1ZGlvLCB0aGF0IHdpbGwgYmUgbG9hZGVkIGluIHRoZSAnZW1wdGllZCcgaGFuZGxlciBiZWxvd1xuXHRcdHBsYXllci52aWRlby5sb2FkKCk7XG5cdFx0Ly8gY29uc29sZS5sb2coJ1dpbGwgbG9hZCcpO1xuXHR9XG5cblx0Ly8gY29uc29sZS5hc3NlcnQocGxheWVyLnZpZGVvLmN1cnJlbnRUaW1lID09PSBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lLCAnVmlkZW8gbm90IHVwZGF0aW5nIScpO1xuXG5cdGlmIChwbGF5ZXIudmlkZW8uZW5kZWQpIHtcblx0XHRkZWxldGUgcGxheWVyLnZpZGVvW+CyoGV2ZW50XTsgLy8gYWxsb3cgdGltZXVwZGF0ZSBldmVudFxuXHRcdHBsYXllci52aWRlby5wYXVzZSh0cnVlKTtcblx0fVxufVxuXG4vKipcbiAqIE1FVEhPRFNcbiAqL1xuXG5mdW5jdGlvbiBwbGF5KCkge1xuXHQvLyBjb25zb2xlLmxvZygncGxheScpO1xuXHR2YXIgdmlkZW8gPSB0aGlzO1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblxuXHQvLyBpZiBpdCdzIGZ1bGxzY3JlZW4sIHVzZSB0aGUgbmF0aXZlIHBsYXllclxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwbGF5XSgpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmIChwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gJ2RhdGE6JyAmJiBwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gdmlkZW8uc3JjKSB7XG5cdFx0Ly8gY29uc29sZS5sb2coJ3NyYyBjaGFuZ2VkIG9uIHBsYXknLCB2aWRlby5zcmMpO1xuXHRcdHNldFRpbWUodmlkZW8sIDAsIHRydWUpO1xuXHRcdHBsYXllci5kcml2ZXIuc3JjID0gdmlkZW8uc3JjO1xuXHR9XG5cblx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0cGxheWVyLnBhdXNlZCA9IGZhbHNlO1xuXG5cdGlmICghdmlkZW8uYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0Ly8gLmxvYWQoKSBjYXVzZXMgdGhlIGVtcHRpZWQgZXZlbnRcblx0XHQvLyB0aGUgYWx0ZXJuYXRpdmUgaXMgLnBsYXkoKSsucGF1c2UoKSBidXQgdGhhdCB0cmlnZ2VycyBwbGF5L3BhdXNlIGV2ZW50cywgZXZlbiB3b3JzZVxuXHRcdC8vIHBvc3NpYmx5IHRoZSBhbHRlcm5hdGl2ZSBpcyBwcmV2ZW50aW5nIHRoaXMgZXZlbnQgb25seSBvbmNlXG5cdFx0dmlkZW8ubG9hZCgpO1xuXHR9XG5cblx0cGxheWVyLmRyaXZlci5wbGF5KCk7XG5cdHBsYXllci51cGRhdGVyLnN0YXJ0KCk7XG5cblx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5Jyk7XG5cdFx0aWYgKHBsYXllci52aWRlby5yZWFkeVN0YXRlID49IHBsYXllci52aWRlby5IQVZFX0VOT1VHSF9EQVRBKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnb25wbGF5Jyk7XG5cdFx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5aW5nJyk7XG5cdFx0fVxuXHR9XG59XG5mdW5jdGlvbiBwYXVzZShmb3JjZUV2ZW50cykge1xuXHQvLyBjb25zb2xlLmxvZygncGF1c2UnKTtcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0cGxheWVyLmRyaXZlci5wYXVzZSgpO1xuXHRwbGF5ZXIudXBkYXRlci5zdG9wKCk7XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB0aGUgZGV2ZWxvcGVyIHRoZSBuYXRpdmUgcGxheWVyLnBhdXNlKClcblx0Ly8gVGhpcyBpcyBhdCB0aGUgZW5kIG9mIHBhdXNlKCkgYmVjYXVzZSBpdCBhbHNvXG5cdC8vIG5lZWRzIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBzaW11bGF0aW9uIGlzIHBhdXNlZFxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwYXVzZV0oKTtcblx0fVxuXG5cdGlmIChwbGF5ZXIucGF1c2VkICYmICFmb3JjZUV2ZW50cykge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHBsYXllci5wYXVzZWQgPSB0cnVlO1xuXHRpZiAoIXBsYXllci5oYXNBdWRpbykge1xuXHRcdGRpc3BhdGNoRXZlbnRBc3luYyh2aWRlbywgJ3BhdXNlJyk7XG5cdH1cblx0aWYgKHZpZGVvLmVuZGVkKSB7XG5cdFx0dmlkZW9b4LKgZXZlbnRdID0gdHJ1ZTtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdlbmRlZCcpO1xuXHR9XG59XG5cbi8qKlxuICogU0VUVVBcbiAqL1xuXG5mdW5jdGlvbiBhZGRQbGF5ZXIodmlkZW8sIGhhc0F1ZGlvKSB7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdID0ge307XG5cdHBsYXllci5wYXVzZWQgPSB0cnVlOyAvLyB0cmFjayB3aGV0aGVyICdwYXVzZScgZXZlbnRzIGhhdmUgYmVlbiBmaXJlZFxuXHRwbGF5ZXIuaGFzQXVkaW8gPSBoYXNBdWRpbztcblx0cGxheWVyLnZpZGVvID0gdmlkZW87XG5cdHBsYXllci51cGRhdGVyID0gaW50ZXJ2YWxvbWV0ZXIuZnJhbWVJbnRlcnZhbG9tZXRlcih1cGRhdGUuYmluZChwbGF5ZXIpKTtcblxuXHRpZiAoaGFzQXVkaW8pIHtcblx0XHRwbGF5ZXIuZHJpdmVyID0gZ2V0QXVkaW9Gcm9tVmlkZW8odmlkZW8pO1xuXHR9IGVsc2Uge1xuXHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ2NhbnBsYXknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAoIXZpZGVvLnBhdXNlZCkge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnb25jYW5wbGF5Jyk7XG5cdFx0XHRcdGRpc3BhdGNoRXZlbnRBc3luYyh2aWRlbywgJ3BsYXlpbmcnKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRwbGF5ZXIuZHJpdmVyID0ge1xuXHRcdFx0c3JjOiB2aWRlby5zcmMgfHwgdmlkZW8uY3VycmVudFNyYyB8fCAnZGF0YTonLFxuXHRcdFx0bXV0ZWQ6IHRydWUsXG5cdFx0XHRwYXVzZWQ6IHRydWUsXG5cdFx0XHRwYXVzZTogZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLnBhdXNlZCA9IHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0cGxheTogZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLnBhdXNlZCA9IGZhbHNlO1xuXHRcdFx0XHQvLyBtZWRpYSBhdXRvbWF0aWNhbGx5IGdvZXMgdG8gMCBpZiAucGxheSgpIGlzIGNhbGxlZCB3aGVuIGl0J3MgZG9uZVxuXHRcdFx0XHRpZiAoaXNQbGF5ZXJFbmRlZChwbGF5ZXIpKSB7XG5cdFx0XHRcdFx0c2V0VGltZSh2aWRlbywgMCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXQgZW5kZWQoKSB7XG5cdFx0XHRcdHJldHVybiBpc1BsYXllckVuZGVkKHBsYXllcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8vIC5sb2FkKCkgY2F1c2VzIHRoZSBlbXB0aWVkIGV2ZW50XG5cdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ2VtcHRpZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gY29uc29sZS5sb2coJ2RyaXZlciBzcmMgaXMnLCBwbGF5ZXIuZHJpdmVyLnNyYyk7XG5cdFx0dmFyIHdhc0VtcHR5ID0gIXBsYXllci5kcml2ZXIuc3JjIHx8IHBsYXllci5kcml2ZXIuc3JjID09PSAnZGF0YTonO1xuXHRcdGlmIChwbGF5ZXIuZHJpdmVyLnNyYyAmJiBwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gdmlkZW8uc3JjKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnc3JjIGNoYW5nZWQgdG8nLCB2aWRlby5zcmMpO1xuXHRcdFx0c2V0VGltZSh2aWRlbywgMCwgdHJ1ZSk7XG5cdFx0XHRwbGF5ZXIuZHJpdmVyLnNyYyA9IHZpZGVvLnNyYztcblx0XHRcdC8vIHBsYXlpbmcgdmlkZW9zIHdpbGwgb25seSBrZWVwIHBsYXlpbmcgaWYgbm8gc3JjIHdhcyBwcmVzZW50IHdoZW4gLnBsYXkoKeKAmWVkXG5cdFx0XHRpZiAod2FzRW1wdHkpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wbGF5KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwbGF5ZXIudXBkYXRlci5zdG9wKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9LCBmYWxzZSk7XG5cblx0Ly8gc3RvcCBwcm9ncmFtbWF0aWMgcGxheWVyIHdoZW4gT1MgdGFrZXMgb3ZlclxuXHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRiZWdpbmZ1bGxzY3JlZW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRcdC8vIG1ha2Ugc3VyZSB0aGF0IHRoZSA8YXVkaW8+IGFuZCB0aGUgc3luY2VyL3VwZGF0ZXIgYXJlIHN0b3BwZWRcblx0XHRcdHZpZGVvLnBhdXNlKCk7XG5cblx0XHRcdC8vIHBsYXkgdmlkZW8gbmF0aXZlbHlcblx0XHRcdHZpZGVvW+CyoHBsYXldKCk7XG5cdFx0fSBlbHNlIGlmIChoYXNBdWRpbyAmJiAhcGxheWVyLmRyaXZlci5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHRcdC8vIGlmIHRoZSBmaXJzdCBwbGF5IGlzIG5hdGl2ZSxcblx0XHRcdC8vIHRoZSA8YXVkaW8+IG5lZWRzIHRvIGJlIGJ1ZmZlcmVkIG1hbnVhbGx5XG5cdFx0XHQvLyBzbyB3aGVuIHRoZSBmdWxsc2NyZWVuIGVuZHMsIGl0IGNhbiBiZSBzZXQgdG8gdGhlIHNhbWUgY3VycmVudCB0aW1lXG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmxvYWQoKTtcblx0XHR9XG5cdH0pO1xuXHRpZiAoaGFzQXVkaW8pIHtcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRlbmRmdWxsc2NyZWVuJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gc3luYyBhdWRpbyB0byBuZXcgdmlkZW8gcG9zaXRpb25cblx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSB2aWRlby5jdXJyZW50VGltZTtcblx0XHRcdC8vIGNvbnNvbGUuYXNzZXJ0KHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPT09IHZpZGVvLmN1cnJlbnRUaW1lLCAnQXVkaW8gbm90IHN5bmNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gYWxsb3cgc2Vla2luZ1xuXHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAobGFzdFJlcXVlc3RzLmluZGV4T2YodmlkZW8uY3VycmVudFRpbWUgKiAxMDAgfCAwIC8gMTAwKSA8IDApIHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ1VzZXItcmVxdWVzdGVkIHNlZWtpbmcnKTtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHZpZGVvLmN1cnJlbnRUaW1lO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG92ZXJsb2FkQVBJKHZpZGVvKSB7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdO1xuXHR2aWRlb1vgsqBwbGF5XSA9IHZpZGVvLnBsYXk7XG5cdHZpZGVvW+CyoHBhdXNlXSA9IHZpZGVvLnBhdXNlO1xuXHR2aWRlby5wbGF5ID0gcGxheTtcblx0dmlkZW8ucGF1c2UgPSBwYXVzZTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ3BhdXNlZCcsIHBsYXllci5kcml2ZXIpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnbXV0ZWQnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ3BsYXliYWNrUmF0ZScsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnZW5kZWQnLCBwbGF5ZXIuZHJpdmVyKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ2xvb3AnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnc2Vla2luZycpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdzZWVrZWQnKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAndGltZXVwZGF0ZScsIOCyoGV2ZW50LCBmYWxzZSk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ2VuZGVkJywg4LKgZXZlbnQsIGZhbHNlKTsgLy8gcHJldmVudCBvY2Nhc2lvbmFsIG5hdGl2ZSBlbmRlZCBldmVudHNcbn1cblxuZnVuY3Rpb24gZW5hYmxlSW5saW5lVmlkZW8odmlkZW8sIGhhc0F1ZGlvLCBvbmx5V2hpdGVsaXN0ZWQpIHtcblx0aWYgKCBoYXNBdWRpbyA9PT0gdm9pZCAwICkgaGFzQXVkaW8gPSB0cnVlO1xuXHRpZiAoIG9ubHlXaGl0ZWxpc3RlZCA9PT0gdm9pZCAwICkgb25seVdoaXRlbGlzdGVkID0gdHJ1ZTtcblxuXHRpZiAoKG9ubHlXaGl0ZWxpc3RlZCAmJiAhaXNXaGl0ZWxpc3RlZCkgfHwgdmlkZW9b4LKgXSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRhZGRQbGF5ZXIodmlkZW8sIGhhc0F1ZGlvKTtcblx0b3ZlcmxvYWRBUEkodmlkZW8pO1xuXHR2aWRlby5jbGFzc0xpc3QuYWRkKCdJSVYnKTtcblx0aWYgKCFoYXNBdWRpbyAmJiB2aWRlby5hdXRvcGxheSkge1xuXHRcdHZpZGVvLnBsYXkoKTtcblx0fVxuXHRpZiAoIS9pUGhvbmV8aVBvZHxpUGFkLy50ZXN0KG5hdmlnYXRvci5wbGF0Zm9ybSkpIHtcblx0XHRjb25zb2xlLndhcm4oJ2lwaG9uZS1pbmxpbmUtdmlkZW8gaXMgbm90IGd1YXJhbnRlZWQgdG8gd29yayBpbiBlbXVsYXRlZCBlbnZpcm9ubWVudHMnKTtcblx0fVxufVxuXG5lbmFibGVJbmxpbmVWaWRlby5pc1doaXRlbGlzdGVkID0gaXNXaGl0ZWxpc3RlZDtcblxubW9kdWxlLmV4cG9ydHMgPSBlbmFibGVJbmxpbmVWaWRlbzsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBpbmRleCA9IHR5cGVvZiBTeW1ib2wgPT09ICd1bmRlZmluZWQnID8gZnVuY3Rpb24gKGRlc2NyaXB0aW9uKSB7XG5cdHJldHVybiAnQCcgKyAoZGVzY3JpcHRpb24gfHwgJ0AnKSArIE1hdGgucmFuZG9tKCk7XG59IDogU3ltYm9sO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGluZGV4OyIsIi8qKlxuICpcbiAqIChjKSBXZW5zaGVuZyBZYW4gPHlhbndzaEBnbWFpbC5jb20+XG4gKiBEYXRlOiAxMC8zMC8xNlxuICpcbiAqIEZvciB0aGUgZnVsbCBjb3B5cmlnaHQgYW5kIGxpY2Vuc2UgaW5mb3JtYXRpb24sIHBsZWFzZSB2aWV3IHRoZSBMSUNFTlNFXG4gKiBmaWxlIHRoYXQgd2FzIGRpc3RyaWJ1dGVkIHdpdGggdGhpcyBzb3VyY2UgY29kZS5cbiAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi4vbGliL0RldGVjdG9yJztcbmltcG9ydCBNb2JpbGVCdWZmZXJpbmcgZnJvbSAnLi4vbGliL01vYmlsZUJ1ZmZlcmluZyc7XG5pbXBvcnQgVXRpbCBmcm9tICcuLi9saWIvVXRpbCc7XG5cbmNvbnN0IEhBVkVfQ1VSUkVOVF9EQVRBID0gMjtcblxudmFyIEJhc2VDYW52YXMgPSBmdW5jdGlvbiAoYmFzZUNvbXBvbmVudCwgVEhSRUUsIHNldHRpbmdzID0ge30pIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncyA9IG9wdGlvbnM7XG4gICAgICAgICAgICAvL2Jhc2ljIHNldHRpbmdzXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gcGxheWVyLmVsKCkub2Zmc2V0V2lkdGgsIHRoaXMuaGVpZ2h0ID0gcGxheWVyLmVsKCkub2Zmc2V0SGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5sb24gPSBvcHRpb25zLmluaXRMb24sIHRoaXMubGF0ID0gb3B0aW9ucy5pbml0TGF0LCB0aGlzLnBoaSA9IDAsIHRoaXMudGhldGEgPSAwO1xuICAgICAgICAgICAgdGhpcy52aWRlb1R5cGUgPSBvcHRpb25zLnZpZGVvVHlwZTtcbiAgICAgICAgICAgIHRoaXMuY2xpY2tUb1RvZ2dsZSA9IG9wdGlvbnMuY2xpY2tUb1RvZ2dsZTtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmlzVXNlckludGVyYWN0aW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vZGVmaW5lIHJlbmRlclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuYXV0b0NsZWFyID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldENsZWFyQ29sb3IoMHgwMDAwMDAsIDEpO1xuXG4gICAgICAgICAgICAvL2RlZmluZSB0ZXh0dXJlLCBvbiBpZSAxMSwgd2UgbmVlZCBhZGRpdGlvbmFsIGhlbHBlciBjYW52YXMgdG8gc29sdmUgcmVuZGVyaW5nIGlzc3VlLlxuICAgICAgICAgICAgdmFyIHZpZGVvID0gc2V0dGluZ3MuZ2V0VGVjaChwbGF5ZXIpO1xuICAgICAgICAgICAgdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlID0gRGV0ZWN0b3Iuc3VwcG9ydFZpZGVvVGV4dHVyZSgpO1xuICAgICAgICAgICAgdGhpcy5saXZlU3RyZWFtT25TYWZhcmkgPSBEZXRlY3Rvci5pc0xpdmVTdHJlYW1PblNhZmFyaSh2aWRlbyk7XG4gICAgICAgICAgICBpZih0aGlzLmxpdmVTdHJlYW1PblNhZmFyaSkgdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlID0gZmFsc2U7XG4gICAgICAgICAgICBpZighdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmhlbHBlckNhbnZhcyA9IHBsYXllci5hZGRDaGlsZChcIkhlbHBlckNhbnZhc1wiLCB7XG4gICAgICAgICAgICAgICAgICAgIHZpZGVvOiB2aWRlbyxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IChvcHRpb25zLmhlbHBlckNhbnZhcy53aWR0aCk/IG9wdGlvbnMuaGVscGVyQ2FudmFzLndpZHRoOiB0aGlzLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IChvcHRpb25zLmhlbHBlckNhbnZhcy5oZWlnaHQpPyBvcHRpb25zLmhlbHBlckNhbnZhcy5oZWlnaHQ6IHRoaXMuaGVpZ2h0XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRleHQgPSB0aGlzLmhlbHBlckNhbnZhcy5lbCgpO1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZSA9IG5ldyBUSFJFRS5UZXh0dXJlKGNvbnRleHQpO1xuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUodmlkZW8pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2aWRlby5zdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjtcblxuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmdlbmVyYXRlTWlwbWFwcyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5tYXhGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuXG4gICAgICAgICAgICB0aGlzLmVsXyA9IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudDtcbiAgICAgICAgICAgIHRoaXMuZWxfLmNsYXNzTGlzdC5hZGQoJ3Zqcy12aWRlby1jYW52YXMnKTtcblxuICAgICAgICAgICAgb3B0aW9ucy5lbCA9IHRoaXMuZWxfO1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIHRoaXMuYXR0YWNoQ29udHJvbEV2ZW50cygpO1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5vbihcInBsYXlcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHRoaXMudGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRBbmltYXRpb24oKTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXR0YWNoQ29udHJvbEV2ZW50czogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlbW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2htb3ZlJywgdGhpcy5oYW5kbGVUb3VjaE1vdmUuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWRvd24nLCB0aGlzLmhhbmRsZU1vdXNlRG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNoc3RhcnQnLHRoaXMuaGFuZGxlVG91Y2hTdGFydC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNldXAnLCB0aGlzLmhhbmRsZU1vdXNlVXAuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaGVuZCcsIHRoaXMuaGFuZGxlVG91Y2hFbmQuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLnNjcm9sbGFibGUpe1xuICAgICAgICAgICAgICAgIHRoaXMub24oJ21vdXNld2hlZWwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5vbignTW96TW91c2VQaXhlbFNjcm9sbCcsIHRoaXMuaGFuZGxlTW91c2VXaGVlbC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlZW50ZXInLCB0aGlzLmhhbmRsZU1vdXNlRW50ZXIuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWxlYXZlJywgdGhpcy5oYW5kbGVNb3VzZUxlYXNlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignZGlzcG9zZScsIHRoaXMuaGFuZGxlRGlzcG9zZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVEaXNwb3NlOiBmdW5jdGlvbiAoZXZlbnQpe1xuICAgICAgICAgICAgdGhpcy5vZmYoJ21vdXNlbW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vZmYoJ3RvdWNobW92ZScsIHRoaXMuaGFuZGxlVG91Y2hNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vZmYoJ21vdXNlZG93bicsIHRoaXMuaGFuZGxlTW91c2VEb3duLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vZmYoJ3RvdWNoc3RhcnQnLHRoaXMuaGFuZGxlVG91Y2hTdGFydC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub2ZmKCdtb3VzZXVwJywgdGhpcy5oYW5kbGVNb3VzZVVwLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vZmYoJ3RvdWNoZW5kJywgdGhpcy5oYW5kbGVUb3VjaEVuZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3Muc2Nyb2xsYWJsZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5vZmYoJ21vdXNld2hlZWwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5vZmYoJ01vek1vdXNlUGl4ZWxTY3JvbGwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLm9mZignbW91c2VlbnRlcicsIHRoaXMuaGFuZGxlTW91c2VFbnRlci5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub2ZmKCdtb3VzZWxlYXZlJywgdGhpcy5oYW5kbGVNb3VzZUxlYXNlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vZmYoJ2Rpc3Bvc2UnLCB0aGlzLmhhbmRsZURpc3Bvc2UuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLnN0b3BBbmltYXRpb24oKTtcbiAgICAgICAgfSxcblxuICAgICAgICBzdGFydEFuaW1hdGlvbjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyX2FuaW1hdGlvbiA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmFuaW1hdGUoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBzdG9wQW5pbWF0aW9uOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJfYW5pbWF0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICBpZih0aGlzLnJlcXVlc3RBbmltYXRpb25JZCl7XG4gICAgICAgICAgICAgICAgY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5yZXF1ZXN0QW5pbWF0aW9uSWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVJlc2l6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMucGxheWVyKCkuZWwoKS5vZmZzZXRXaWR0aCwgdGhpcy5oZWlnaHQgPSB0aGlzLnBsYXllcigpLmVsKCkub2Zmc2V0SGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCApO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlVXA6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XG4gICAgICAgICAgICBpZih0aGlzLmNsaWNrVG9Ub2dnbGUpe1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC5jaGFuZ2VkVG91Y2hlcyAmJiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC5jaGFuZ2VkVG91Y2hlcyAmJiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZiBjbGllbnRYID09PSBcInVuZGVmaW5lZFwiIHx8IGNsaWVudFkgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgICAgICB2YXIgZGlmZlggPSBNYXRoLmFicyhjbGllbnRYIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclgpO1xuICAgICAgICAgICAgICAgIHZhciBkaWZmWSA9IE1hdGguYWJzKGNsaWVudFkgLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSk7XG4gICAgICAgICAgICAgICAgaWYoZGlmZlggPCAwLjEgJiYgZGlmZlkgPCAwLjEpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyKCkucGF1c2VkKCkgPyB0aGlzLnBsYXllcigpLnBsYXkoKSA6IHRoaXMucGxheWVyKCkucGF1c2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZURvd246IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICBpZih0eXBlb2YgY2xpZW50WCA9PT0gXCJ1bmRlZmluZWRcIiB8fCBjbGllbnRZID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCA9IGNsaWVudFg7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSA9IGNsaWVudFk7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Mb24gPSB0aGlzLmxvbjtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93bkxhdCA9IHRoaXMubGF0O1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVRvdWNoU3RhcnQ6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIGlmKGV2ZW50LnRvdWNoZXMubGVuZ3RoID4gMSl7XG4gICAgICAgICAgICAgICAgdGhpcy5pc1VzZXJQaW5jaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5tdWx0aVRvdWNoRGlzdGFuY2UgPSBVdGlsLmdldFRvdWNoZXNEaXN0YW5jZShldmVudC50b3VjaGVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTW91c2VEb3duKGV2ZW50KTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVUb3VjaEVuZDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJQaW5jaCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVNb3VzZVVwKGV2ZW50KTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZU1vdmU6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBjbGllbnRYID09PSBcInVuZGVmaW5lZFwiIHx8IGNsaWVudFkgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuY2xpY2tBbmREcmFnKXtcbiAgICAgICAgICAgICAgICBpZih0aGlzLm1vdXNlRG93bil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKCB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCAtIGNsaWVudFggKSAqIDAuMiArIHRoaXMub25Qb2ludGVyRG93bkxvbjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoIGNsaWVudFkgLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSApICogMC4yICsgdGhpcy5vblBvaW50ZXJEb3duTGF0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHZhciB4ID0gY2xpZW50WCAtIHRoaXMuZWxfLm9mZnNldExlZnQ7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBjbGllbnRZIC0gdGhpcy5lbF8ub2Zmc2V0VG9wO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKHggLyB0aGlzLndpZHRoKSAqIDQzMCAtIDIyNTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9ICh5IC8gdGhpcy5oZWlnaHQpICogLTE4MCArIDkwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVRvdWNoTW92ZTogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgLy9oYW5kbGUgc2luZ2xlIHRvdWNoIGV2ZW50LFxuICAgICAgICAgICAgaWYoIXRoaXMuaXNVc2VyUGluY2ggfHwgZXZlbnQudG91Y2hlcy5sZW5ndGggPD0gMSl7XG4gICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVNb3VzZU1vdmUoZXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vYmlsZU9yaWVudGF0aW9uOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBldmVudC5yb3RhdGlvblJhdGUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgIHZhciB4ID0gZXZlbnQucm90YXRpb25SYXRlLmFscGhhO1xuICAgICAgICAgICAgdmFyIHkgPSBldmVudC5yb3RhdGlvblJhdGUuYmV0YTtcbiAgICAgICAgICAgIHZhciBwb3J0cmFpdCA9ICh0eXBlb2YgZXZlbnQucG9ydHJhaXQgIT09IFwidW5kZWZpbmVkXCIpPyBldmVudC5wb3J0cmFpdCA6IHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBwb3J0cmFpdClcIikubWF0Y2hlcztcbiAgICAgICAgICAgIHZhciBsYW5kc2NhcGUgPSAodHlwZW9mIGV2ZW50LmxhbmRzY2FwZSAhPT0gXCJ1bmRlZmluZWRcIik/IGV2ZW50LmxhbmRzY2FwZSA6IHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBsYW5kc2NhcGUpXCIpLm1hdGNoZXM7XG4gICAgICAgICAgICB2YXIgb3JpZW50YXRpb24gPSBldmVudC5vcmllbnRhdGlvbiB8fCB3aW5kb3cub3JpZW50YXRpb247XG5cbiAgICAgICAgICAgIGlmIChwb3J0cmFpdCkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gdGhpcy5sb24gLSB5ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IHRoaXMubGF0ICsgeCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICB9ZWxzZSBpZihsYW5kc2NhcGUpe1xuICAgICAgICAgICAgICAgIHZhciBvcmllbnRhdGlvbkRlZ3JlZSA9IC05MDtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2Ygb3JpZW50YXRpb24gIT0gXCJ1bmRlZmluZWRcIil7XG4gICAgICAgICAgICAgICAgICAgIG9yaWVudGF0aW9uRGVncmVlID0gb3JpZW50YXRpb247XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5sb24gPSAob3JpZW50YXRpb25EZWdyZWUgPT0gLTkwKT8gdGhpcy5sb24gKyB4ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZSA6IHRoaXMubG9uIC0geCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAob3JpZW50YXRpb25EZWdyZWUgPT0gLTkwKT8gdGhpcy5sYXQgKyB5ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZSA6IHRoaXMubGF0IC0geSAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlRW50ZXI6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IHRydWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VMZWFzZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLmlzVXNlckludGVyYWN0aW5nID0gZmFsc2U7XG4gICAgICAgICAgICBpZih0aGlzLm1vdXNlRG93bikge1xuICAgICAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgYW5pbWF0ZTogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGlmKCF0aGlzLnJlbmRlcl9hbmltYXRpb24pIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMucmVxdWVzdEFuaW1hdGlvbklkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCB0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSApO1xuICAgICAgICAgICAgaWYoIXRoaXMucGxheWVyKCkucGF1c2VkKCkpe1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZih0aGlzLnRleHR1cmUpICE9PSBcInVuZGVmaW5lZFwiICYmICghdGhpcy5pc1BsYXlPbk1vYmlsZSAmJiB0aGlzLnBsYXllcigpLnJlYWR5U3RhdGUoKSA+PSBIQVZFX0NVUlJFTlRfREFUQSB8fCB0aGlzLmlzUGxheU9uTW9iaWxlICYmIHRoaXMucGxheWVyKCkuaGFzQ2xhc3MoXCJ2anMtcGxheWluZ1wiKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN0ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdCAtIHRoaXMudGltZSA+PSAzMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGltZSA9IGN0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmKHRoaXMuaXNQbGF5T25Nb2JpbGUpe1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnRUaW1lID0gdGhpcy5wbGF5ZXIoKS5jdXJyZW50VGltZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYoTW9iaWxlQnVmZmVyaW5nLmlzQnVmZmVyaW5nKGN1cnJlbnRUaW1lKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIXRoaXMucGxheWVyKCkuaGFzQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIikpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllcigpLmFkZENsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKHRoaXMucGxheWVyKCkuaGFzQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIikpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllcigpLnJlbW92ZUNsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVuZGVyOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgaWYoIXRoaXMuaXNVc2VySW50ZXJhY3Rpbmcpe1xuICAgICAgICAgICAgICAgIHZhciBzeW1ib2xMYXQgPSAodGhpcy5sYXQgPiB0aGlzLnNldHRpbmdzLmluaXRMYXQpPyAgLTEgOiAxO1xuICAgICAgICAgICAgICAgIHZhciBzeW1ib2xMb24gPSAodGhpcy5sb24gPiB0aGlzLnNldHRpbmdzLmluaXRMb24pPyAgLTEgOiAxO1xuICAgICAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuYmFja1RvVmVydGljYWxDZW50ZXIpe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IChcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID4gKHRoaXMuc2V0dGluZ3MuaW5pdExhdCAtIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExhdCkpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA8ICh0aGlzLnNldHRpbmdzLmluaXRMYXQgKyBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMYXQpKVxuICAgICAgICAgICAgICAgICAgICApPyB0aGlzLnNldHRpbmdzLmluaXRMYXQgOiB0aGlzLmxhdCArIHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExhdCAqIHN5bWJvbExhdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5iYWNrVG9Ib3Jpem9uQ2VudGVyKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA+ICh0aGlzLnNldHRpbmdzLmluaXRMb24gLSBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMb24pKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPCAodGhpcy5zZXR0aW5ncy5pbml0TG9uICsgTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTG9uKSlcbiAgICAgICAgICAgICAgICAgICAgKT8gdGhpcy5zZXR0aW5ncy5pbml0TG9uIDogdGhpcy5sb24gKyB0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMb24gKiBzeW1ib2xMb247XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5sYXQgPSBNYXRoLm1heCggdGhpcy5zZXR0aW5ncy5taW5MYXQsIE1hdGgubWluKCB0aGlzLnNldHRpbmdzLm1heExhdCwgdGhpcy5sYXQgKSApO1xuICAgICAgICAgICAgdGhpcy5sb24gPSBNYXRoLm1heCggdGhpcy5zZXR0aW5ncy5taW5Mb24sIE1hdGgubWluKCB0aGlzLnNldHRpbmdzLm1heExvbiwgdGhpcy5sb24gKSApO1xuICAgICAgICAgICAgdGhpcy5waGkgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCA5MCAtIHRoaXMubGF0ICk7XG4gICAgICAgICAgICB0aGlzLnRoZXRhID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggdGhpcy5sb24gKTtcblxuICAgICAgICAgICAgaWYoIXRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5oZWxwZXJDYW52YXMudXBkYXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmNsZWFyKCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcGxheU9uTW9iaWxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmlzUGxheU9uTW9iaWxlID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuYXV0b01vYmlsZU9yaWVudGF0aW9uKVxuICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdkZXZpY2Vtb3Rpb24nLCB0aGlzLmhhbmRsZU1vYmlsZU9yaWVudGF0aW9uLmJpbmQodGhpcykpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZWxfO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgQmFzZUNhbnZhcztcbiIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC8zLzE2LlxuICovXG5cbmltcG9ydCBCYXNlQ2FudmFzIGZyb20gJy4vQmFzZUNhbnZhcyc7XG5pbXBvcnQgVXRpbCBmcm9tICcuL1V0aWwnO1xuXG52YXIgQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyA9IHt9KSB7XG4gICAgdmFyIHBhcmVudCA9IEJhc2VDYW52YXMoYmFzZUNvbXBvbmVudCwgVEhSRUUsIHNldHRpbmdzKTtcblxuICAgIHJldHVybiBVdGlsLmV4dGVuZChwYXJlbnQsIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHBhcmVudC5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIHRoaXMuVlJNb2RlID0gZmFsc2U7XG4gICAgICAgICAgICAvL2RlZmluZSBzY2VuZVxuICAgICAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xuICAgICAgICAgICAgLy9kZWZpbmUgY2FtZXJhXG4gICAgICAgICAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShvcHRpb25zLmluaXRGb3YsIHRoaXMud2lkdGggLyB0aGlzLmhlaWdodCwgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQgPSBuZXcgVEhSRUUuVmVjdG9yMyggMCwgMCwgMCApO1xuXG4gICAgICAgICAgICAvL2RlZmluZSBnZW9tZXRyeVxuICAgICAgICAgICAgdmFyIGdlb21ldHJ5ID0gKHRoaXMudmlkZW9UeXBlID09PSBcImVxdWlyZWN0YW5ndWxhclwiKT8gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KDUwMCwgNjAsIDQwKTogbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KCA1MDAsIDYwLCA0MCApLnRvTm9uSW5kZXhlZCgpO1xuICAgICAgICAgICAgaWYodGhpcy52aWRlb1R5cGUgPT09IFwiZmlzaGV5ZVwiKXtcbiAgICAgICAgICAgICAgICBsZXQgbm9ybWFscyA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMubm9ybWFsLmFycmF5O1xuICAgICAgICAgICAgICAgIGxldCB1dnMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLnV2LmFycmF5O1xuICAgICAgICAgICAgICAgIGZvciAoIGxldCBpID0gMCwgbCA9IG5vcm1hbHMubGVuZ3RoIC8gMzsgaSA8IGw7IGkgKysgKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB4ID0gbm9ybWFsc1sgaSAqIDMgKyAwIF07XG4gICAgICAgICAgICAgICAgICAgIGxldCB5ID0gbm9ybWFsc1sgaSAqIDMgKyAxIF07XG4gICAgICAgICAgICAgICAgICAgIGxldCB6ID0gbm9ybWFsc1sgaSAqIDMgKyAyIF07XG5cbiAgICAgICAgICAgICAgICAgICAgbGV0IHIgPSBNYXRoLmFzaW4oTWF0aC5zcXJ0KHggKiB4ICsgeiAqIHopIC8gTWF0aC5zcXJ0KHggKiB4ICArIHkgKiB5ICsgeiAqIHopKSAvIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgICAgIGlmKHkgPCAwKSByID0gMSAtIHI7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0aGV0YSA9ICh4ID09IDAgJiYgeiA9PSAwKT8gMCA6IE1hdGguYWNvcyh4IC8gTWF0aC5zcXJ0KHggKiB4ICsgeiAqIHopKTtcbiAgICAgICAgICAgICAgICAgICAgaWYoeiA8IDApIHRoZXRhID0gdGhldGEgKiAtMTtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDAgXSA9IC0wLjggKiByICogTWF0aC5jb3ModGhldGEpICsgMC41O1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMSBdID0gMC44ICogciAqIE1hdGguc2luKHRoZXRhKSArIDAuNTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWCggb3B0aW9ucy5yb3RhdGVYKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVZKCBvcHRpb25zLnJvdGF0ZVkpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVooIG9wdGlvbnMucm90YXRlWik7XG4gICAgICAgICAgICB9ZWxzZSBpZih0aGlzLnZpZGVvVHlwZSA9PT0gXCJkdWFsX2Zpc2hleWVcIil7XG4gICAgICAgICAgICAgICAgbGV0IG5vcm1hbHMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLm5vcm1hbC5hcnJheTtcbiAgICAgICAgICAgICAgICBsZXQgdXZzID0gZ2VvbWV0cnkuYXR0cmlidXRlcy51di5hcnJheTtcbiAgICAgICAgICAgICAgICBsZXQgbCA9IG5vcm1hbHMubGVuZ3RoIC8gMztcbiAgICAgICAgICAgICAgICBmb3IgKCBsZXQgaSA9IDA7IGkgPCBsIC8gMjsgaSArKyApIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHggPSBub3JtYWxzWyBpICogMyArIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHkgPSBub3JtYWxzWyBpICogMyArIDEgXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHogPSBub3JtYWxzWyBpICogMyArIDIgXTtcblxuICAgICAgICAgICAgICAgICAgICBsZXQgciA9ICggeCA9PSAwICYmIHogPT0gMCApID8gMSA6ICggTWF0aC5hY29zKCB5ICkgLyBNYXRoLnNxcnQoIHggKiB4ICsgeiAqIHogKSApICogKCAyIC8gTWF0aC5QSSApO1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMCBdID0geCAqIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMS5yeCAqIHIgKiBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTEuY292ZXJYICArIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMS54O1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMSBdID0geiAqIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMS5yeSAqIHIgKiBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTEuY292ZXJZICArIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMS55O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKCBsZXQgaSA9IGwgLyAyOyBpIDwgbDsgaSArKyApIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHggPSBub3JtYWxzWyBpICogMyArIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHkgPSBub3JtYWxzWyBpICogMyArIDEgXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHogPSBub3JtYWxzWyBpICogMyArIDIgXTtcblxuICAgICAgICAgICAgICAgICAgICBsZXQgciA9ICggeCA9PSAwICYmIHogPT0gMCApID8gMSA6ICggTWF0aC5hY29zKCAtIHkgKSAvIE1hdGguc3FydCggeCAqIHggKyB6ICogeiApICkgKiAoIDIgLyBNYXRoLlBJICk7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAwIF0gPSAtIHggKiBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTIucnggKiByICogb3B0aW9ucy5kdWFsRmlzaC5jaXJjbGUyLmNvdmVyWCAgKyBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTIueDtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDEgXSA9IHogKiBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTIucnkgKiByICogb3B0aW9ucy5kdWFsRmlzaC5jaXJjbGUyLmNvdmVyWSAgKyBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTIueTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWCggb3B0aW9ucy5yb3RhdGVYKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVZKCBvcHRpb25zLnJvdGF0ZVkpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVooIG9wdGlvbnMucm90YXRlWik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnZW9tZXRyeS5zY2FsZSggLSAxLCAxLCAxICk7XG4gICAgICAgICAgICAvL2RlZmluZSBtZXNoXG4gICAgICAgICAgICB0aGlzLm1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSxcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRoaXMudGV4dHVyZX0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy90aGlzLm1lc2guc2NhbGUueCA9IC0xO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbmFibGVWUjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSB0cnVlO1xuICAgICAgICAgICAgaWYodHlwZW9mIHZySE1EICE9PSAndW5kZWZpbmVkJyl7XG4gICAgICAgICAgICAgICAgdmFyIGV5ZVBhcmFtc0wgPSB2ckhNRC5nZXRFeWVQYXJhbWV0ZXJzKCAnbGVmdCcgKTtcbiAgICAgICAgICAgICAgICB2YXIgZXllUGFyYW1zUiA9IHZySE1ELmdldEV5ZVBhcmFtZXRlcnMoICdyaWdodCcgKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuZXllRk9WTCA9IGV5ZVBhcmFtc0wucmVjb21tZW5kZWRGaWVsZE9mVmlldztcbiAgICAgICAgICAgICAgICB0aGlzLmV5ZUZPVlIgPSBleWVQYXJhbXNSLnJlY29tbWVuZGVkRmllbGRPZlZpZXc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTCA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSh0aGlzLmNhbWVyYS5mb3YsIHRoaXMud2lkdGggLzIgLyB0aGlzLmhlaWdodCwgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEodGhpcy5jYW1lcmEuZm92LCB0aGlzLndpZHRoIC8yIC8gdGhpcy5oZWlnaHQsIDEsIDIwMDApO1xuICAgICAgICB9LFxuXG4gICAgICAgIGRpc2FibGVWUjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0ICk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0ICk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlUmVzaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBwYXJlbnQuaGFuZGxlUmVzaXplLmNhbGwodGhpcyk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICBpZih0aGlzLlZSTW9kZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmFzcGVjdCA9IHRoaXMuY2FtZXJhLmFzcGVjdCAvIDI7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmFzcGVjdCA9IHRoaXMuY2FtZXJhLmFzcGVjdCAvIDI7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlV2hlZWw6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVNb3VzZVdoZWVsKGV2ZW50KTtcbiAgICAgICAgICAgIC8vIFdlYktpdFxuICAgICAgICAgICAgaWYgKCBldmVudC53aGVlbERlbHRhWSApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgLT0gZXZlbnQud2hlZWxEZWx0YVkgKiAwLjA1O1xuICAgICAgICAgICAgICAgIC8vIE9wZXJhIC8gRXhwbG9yZXIgOVxuICAgICAgICAgICAgfSBlbHNlIGlmICggZXZlbnQud2hlZWxEZWx0YSApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgLT0gZXZlbnQud2hlZWxEZWx0YSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gRmlyZWZveFxuICAgICAgICAgICAgfSBlbHNlIGlmICggZXZlbnQuZGV0YWlsICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiArPSBldmVudC5kZXRhaWwgKiAxLjA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgPSBNYXRoLm1pbih0aGlzLnNldHRpbmdzLm1heEZvdiwgdGhpcy5jYW1lcmEuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiA9IE1hdGgubWF4KHRoaXMuc2V0dGluZ3MubWluRm92LCB0aGlzLmNhbWVyYS5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgaWYodGhpcy5WUk1vZGUpe1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgPSB0aGlzLmNhbWVyYS5mb3Y7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmZvdiA9IHRoaXMuY2FtZXJhLmZvdjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlVG91Y2hNb3ZlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVUb3VjaE1vdmUuY2FsbCh0aGlzLCBldmVudCk7XG4gICAgICAgICAgICBpZih0aGlzLmlzVXNlclBpbmNoKXtcbiAgICAgICAgICAgICAgICBsZXQgY3VycmVudERpc3RhbmNlID0gVXRpbC5nZXRUb3VjaGVzRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG4gICAgICAgICAgICAgICAgZXZlbnQud2hlZWxEZWx0YVkgPSAgKGN1cnJlbnREaXN0YW5jZSAtIHRoaXMubXVsdGlUb3VjaERpc3RhbmNlKSAqIDI7XG4gICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVNb3VzZVdoZWVsLmNhbGwodGhpcywgZXZlbnQpO1xuICAgICAgICAgICAgICAgIHRoaXMubXVsdGlUb3VjaERpc3RhbmNlID0gY3VycmVudERpc3RhbmNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHBhcmVudC5yZW5kZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEubG9va0F0KCB0aGlzLmNhbWVyYS50YXJnZXQgKTtcblxuICAgICAgICAgICAgaWYoIXRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICAgICAgdmFyIHZpZXdQb3J0V2lkdGggPSB0aGlzLndpZHRoIC8gMiwgdmlld1BvcnRIZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YgdnJITUQgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnByb2plY3Rpb25NYXRyaXggPSBVdGlsLmZvdlRvUHJvamVjdGlvbiggdGhpcy5leWVGT1ZMLCB0cnVlLCB0aGlzLmNhbWVyYS5uZWFyLCB0aGlzLmNhbWVyYS5mYXIgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnByb2plY3Rpb25NYXRyaXggPSBVdGlsLmZvdlRvUHJvamVjdGlvbiggdGhpcy5leWVGT1ZSLCB0cnVlLCB0aGlzLmNhbWVyYS5uZWFyLCB0aGlzLmNhbWVyYS5mYXIgKTtcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxvbkwgPSB0aGlzLmxvbiArIHRoaXMuc2V0dGluZ3MuVlJHYXBEZWdyZWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsb25SID0gdGhpcy5sb24gLSB0aGlzLnNldHRpbmdzLlZSR2FwRGVncmVlO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YUwgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCBsb25MICk7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YVIgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCBsb25SICk7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldEwgPSBVdGlsLmRlZXBDb3B5KHRoaXMuY2FtZXJhLnRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEwueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoZXRhTCApO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMLnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGV0YUwgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmxvb2tBdCh0YXJnZXRMKTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgdGFyZ2V0UiA9IFV0aWwuZGVlcENvcHkodGhpcy5jYW1lcmEudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Ui54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhldGFSICk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFIueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoZXRhUiApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIubG9va0F0KHRhcmdldFIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyByZW5kZXIgbGVmdCBleWVcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCAwLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3NvciggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmFMICk7XG5cbiAgICAgICAgICAgICAgICAvLyByZW5kZXIgcmlnaHQgZXllXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggdmlld1BvcnRXaWR0aCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIHZpZXdQb3J0V2lkdGgsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhUiApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBDYW52YXM7XG4iLCIvKipcbiAqIENyZWF0ZWQgYnkgdHJpc3RhbiBnZW11cyBvbiAwNi8xNy8yMDE3XG4gKi9cblxudmFyIENhcmRib2FyZE1lc3NhZ2UgPSBmdW5jdGlvbihiYXNlQ29tcG9uZW50KXtcbiAgICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGVsZW1lbnQuY2xhc3NOYW1lID0gXCJ2anMtdmlkZW8tbm90aWNlLWNhcmRib2FyZFwiO1xuXG4gICAgZnVuY3Rpb24gaXNQb3J0cmFpdCgpIHtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgZXZlbnQucG9ydHJhaXQgIT09IFwidW5kZWZpbmVkXCIpPyBldmVudC5wb3J0cmFpdCA6IHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBwb3J0cmFpdClcIikubWF0Y2hlcztcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBhY3RpdmU6IGZhbHNlLFxuXG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBiYXNlQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcbiAgICAgICAgfSxcblxuICAgICAgICBtYXliZURpc3BsYXk6IGZ1bmN0aW9uKGNhbnZhcywgZXZlbnQpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5hY3RpdmUgJiYgY2FudmFzLlZSTW9kZSAmJiBpc1BvcnRyYWl0KCkgJiYgcGxheWVyLmlzRnVsbHNjcmVlbigpKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFwbGF5ZXIucGF1c2VkKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcGxheWVyLnBhdXNlKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5lbCgpLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5hY3RpdmUgJiYgKCFjYW52YXMuVlJNb2RlIHx8ICFpc1BvcnRyYWl0KCkgfHwgIXBsYXllci5pc0Z1bGxzY3JlZW4oKSkpIHtcbiAgICAgICAgICAgICAgICBpZiAocGxheWVyLnBhdXNlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHBsYXllci5wbGF5KCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5lbCgpLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgQ2FyZGJvYXJkTWVzc2FnZTsiLCIvKipcbiAqIEBhdXRob3IgYWx0ZXJlZHEgLyBodHRwOi8vYWx0ZXJlZHF1YWxpYS5jb20vXG4gKiBAYXV0aG9yIG1yLmRvb2IgLyBodHRwOi8vbXJkb29iLmNvbS9cbiAqL1xuXG52YXIgRGV0ZWN0b3IgPSB7XG5cbiAgICBjYW52YXM6ICEhIHdpbmRvdy5DYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG4gICAgd2ViZ2w6ICggZnVuY3Rpb24gKCkge1xuXG4gICAgICAgIHRyeSB7XG5cbiAgICAgICAgICAgIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnY2FudmFzJyApOyByZXR1cm4gISEgKCB3aW5kb3cuV2ViR0xSZW5kZXJpbmdDb250ZXh0ICYmICggY2FudmFzLmdldENvbnRleHQoICd3ZWJnbCcgKSB8fCBjYW52YXMuZ2V0Q29udGV4dCggJ2V4cGVyaW1lbnRhbC13ZWJnbCcgKSApICk7XG5cbiAgICAgICAgfSBjYXRjaCAoIGUgKSB7XG5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICB9XG5cbiAgICB9ICkoKSxcbiAgICB3b3JrZXJzOiAhISB3aW5kb3cuV29ya2VyLFxuICAgIGZpbGVhcGk6IHdpbmRvdy5GaWxlICYmIHdpbmRvdy5GaWxlUmVhZGVyICYmIHdpbmRvdy5GaWxlTGlzdCAmJiB3aW5kb3cuQmxvYixcblxuICAgICBDaGVja19WZXJzaW9uOiBmdW5jdGlvbigpIHtcbiAgICAgICAgIHZhciBydiA9IC0xOyAvLyBSZXR1cm4gdmFsdWUgYXNzdW1lcyBmYWlsdXJlLlxuXG4gICAgICAgICBpZiAobmF2aWdhdG9yLmFwcE5hbWUgPT0gJ01pY3Jvc29mdCBJbnRlcm5ldCBFeHBsb3JlcicpIHtcblxuICAgICAgICAgICAgIHZhciB1YSA9IG5hdmlnYXRvci51c2VyQWdlbnQsXG4gICAgICAgICAgICAgICAgIHJlID0gbmV3IFJlZ0V4cChcIk1TSUUgKFswLTldezEsfVtcXFxcLjAtOV17MCx9KVwiKTtcblxuICAgICAgICAgICAgIGlmIChyZS5leGVjKHVhKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICBydiA9IHBhcnNlRmxvYXQoUmVnRXhwLiQxKTtcbiAgICAgICAgICAgICB9XG4gICAgICAgICB9XG4gICAgICAgICBlbHNlIGlmIChuYXZpZ2F0b3IuYXBwTmFtZSA9PSBcIk5ldHNjYXBlXCIpIHtcbiAgICAgICAgICAgICAvLy8gaW4gSUUgMTEgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIHNheXMgJ3RyaWRlbnQnXG4gICAgICAgICAgICAgLy8vIGluIEVkZ2UgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIGRvZXMgbm90IHNheSB0cmlkZW50XG4gICAgICAgICAgICAgaWYgKG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ1RyaWRlbnQnKSAhPT0gLTEpIHJ2ID0gMTE7XG4gICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudDtcbiAgICAgICAgICAgICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cChcIkVkZ2VcXC8oWzAtOV17MSx9W1xcXFwuMC05XXswLH0pXCIpO1xuICAgICAgICAgICAgICAgICBpZiAocmUuZXhlYyh1YSkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgIHJ2ID0gcGFyc2VGbG9hdChSZWdFeHAuJDEpO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgfVxuXG4gICAgICAgICByZXR1cm4gcnY7XG4gICAgIH0sXG5cbiAgICBzdXBwb3J0VmlkZW9UZXh0dXJlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vaWUgMTEgYW5kIGVkZ2UgMTIgZG9lc24ndCBzdXBwb3J0IHZpZGVvIHRleHR1cmUuXG4gICAgICAgIHZhciB2ZXJzaW9uID0gdGhpcy5DaGVja19WZXJzaW9uKCk7XG4gICAgICAgIHJldHVybiAodmVyc2lvbiA9PT0gLTEgfHwgdmVyc2lvbiA+PSAxMyk7XG4gICAgfSxcblxuICAgIGlzTGl2ZVN0cmVhbU9uU2FmYXJpOiBmdW5jdGlvbiAodmlkZW9FbGVtZW50KSB7XG4gICAgICAgIC8vbGl2ZSBzdHJlYW0gb24gc2FmYXJpIGRvZXNuJ3Qgc3VwcG9ydCB2aWRlbyB0ZXh0dXJlXG4gICAgICAgIHZhciB2aWRlb1NvdXJjZXMgPSBbXS5zbGljZS5jYWxsKHZpZGVvRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKFwic291cmNlXCIpKTtcbiAgICAgICAgdmFyIHJlc3VsdCA9IGZhbHNlO1xuICAgICAgICBpZih2aWRlb0VsZW1lbnQuc3JjICYmIHZpZGVvRWxlbWVudC5zcmMuaW5kZXhPZignLm0zdTgnKSA+IC0xKXtcbiAgICAgICAgICAgIHZpZGVvU291cmNlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICBzcmM6IHZpZGVvRWxlbWVudC5zcmMsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJhcHBsaWNhdGlvbi94LW1wZWdVUkxcIlxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IHZpZGVvU291cmNlcy5sZW5ndGg7IGkrKyl7XG4gICAgICAgICAgICB2YXIgY3VycmVudFZpZGVvU291cmNlID0gdmlkZW9Tb3VyY2VzW2ldO1xuICAgICAgICAgICAgaWYoKGN1cnJlbnRWaWRlb1NvdXJjZS50eXBlID09PSBcImFwcGxpY2F0aW9uL3gtbXBlZ1VSTFwiIHx8IGN1cnJlbnRWaWRlb1NvdXJjZS50eXBlID09PSBcImFwcGxpY2F0aW9uL3ZuZC5hcHBsZS5tcGVndXJsXCIpICYmIC8oU2FmYXJpfEFwcGxlV2ViS2l0KS8udGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSAmJiAvQXBwbGUgQ29tcHV0ZXIvLnRlc3QobmF2aWdhdG9yLnZlbmRvcikpe1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgZ2V0V2ViR0xFcnJvck1lc3NhZ2U6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdkaXYnICk7XG4gICAgICAgIGVsZW1lbnQuaWQgPSAnd2ViZ2wtZXJyb3ItbWVzc2FnZSc7XG5cbiAgICAgICAgaWYgKCAhIHRoaXMud2ViZ2wgKSB7XG5cbiAgICAgICAgICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gd2luZG93LldlYkdMUmVuZGVyaW5nQ29udGV4dCA/IFtcbiAgICAgICAgICAgICAgICAnWW91ciBncmFwaGljcyBjYXJkIGRvZXMgbm90IHNlZW0gdG8gc3VwcG9ydCA8YSBocmVmPVwiaHR0cDovL2tocm9ub3Mub3JnL3dlYmdsL3dpa2kvR2V0dGluZ19hX1dlYkdMX0ltcGxlbWVudGF0aW9uXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+V2ViR0w8L2E+LjxiciAvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKSA6IFtcbiAgICAgICAgICAgICAgICAnWW91ciBicm93c2VyIGRvZXMgbm90IHNlZW0gdG8gc3VwcG9ydCA8YSBocmVmPVwiaHR0cDovL2tocm9ub3Mub3JnL3dlYmdsL3dpa2kvR2V0dGluZ19hX1dlYkdMX0ltcGxlbWVudGF0aW9uXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+V2ViR0w8L2E+Ljxici8+JyxcbiAgICAgICAgICAgICAgICAnRmluZCBvdXQgaG93IHRvIGdldCBpdCA8YSBocmVmPVwiaHR0cDovL2dldC53ZWJnbC5vcmcvXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+aGVyZTwvYT4uJ1xuICAgICAgICAgICAgXS5qb2luKCAnXFxuJyApO1xuXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudDtcblxuICAgIH0sXG5cbiAgICBhZGRHZXRXZWJHTE1lc3NhZ2U6IGZ1bmN0aW9uICggcGFyYW1ldGVycyApIHtcblxuICAgICAgICB2YXIgcGFyZW50LCBpZCwgZWxlbWVudDtcblxuICAgICAgICBwYXJhbWV0ZXJzID0gcGFyYW1ldGVycyB8fCB7fTtcblxuICAgICAgICBwYXJlbnQgPSBwYXJhbWV0ZXJzLnBhcmVudCAhPT0gdW5kZWZpbmVkID8gcGFyYW1ldGVycy5wYXJlbnQgOiBkb2N1bWVudC5ib2R5O1xuICAgICAgICBpZCA9IHBhcmFtZXRlcnMuaWQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMuaWQgOiAnb2xkaWUnO1xuXG4gICAgICAgIGVsZW1lbnQgPSBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpO1xuICAgICAgICBlbGVtZW50LmlkID0gaWQ7XG5cbiAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKCBlbGVtZW50ICk7XG5cbiAgICB9XG5cbn07XG5cbmV4cG9ydCBkZWZhdWx0IERldGVjdG9yOyIsIi8qKlxuICogQ3JlYXRlZCBieSB3ZW5zaGVuZy55YW4gb24gNS8yMy8xNi5cbiAqL1xudmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcbmVsZW1lbnQuY2xhc3NOYW1lID0gXCJ2anMtdmlkZW8taGVscGVyLWNhbnZhc1wiO1xuXG52YXIgSGVscGVyQ2FudmFzID0gZnVuY3Rpb24oYmFzZUNvbXBvbmVudCl7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHRoaXMudmlkZW9FbGVtZW50ID0gb3B0aW9ucy52aWRlbztcbiAgICAgICAgICAgIHRoaXMud2lkdGggPSBvcHRpb25zLndpZHRoO1xuICAgICAgICAgICAgdGhpcy5oZWlnaHQgPSBvcHRpb25zLmhlaWdodDtcblxuICAgICAgICAgICAgZWxlbWVudC53aWR0aCA9IHRoaXMud2lkdGg7XG4gICAgICAgICAgICBlbGVtZW50LmhlaWdodCA9IHRoaXMuaGVpZ2h0O1xuICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgICAgICBvcHRpb25zLmVsID0gZWxlbWVudDtcblxuXG4gICAgICAgICAgICB0aGlzLmNvbnRleHQgPSBlbGVtZW50LmdldENvbnRleHQoJzJkJyk7XG4gICAgICAgICAgICB0aGlzLmNvbnRleHQuZHJhd0ltYWdlKHRoaXMudmlkZW9FbGVtZW50LCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICBiYXNlQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgXG4gICAgICAgIGdldENvbnRleHQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jb250ZXh0OyAgXG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICB1cGRhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5kcmF3SW1hZ2UodGhpcy52aWRlb0VsZW1lbnQsIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBIZWxwZXJDYW52YXM7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA2LzYvMTYuXG4gKi9cbnZhciBNb2JpbGVCdWZmZXJpbmcgPSB7XG4gICAgcHJldl9jdXJyZW50VGltZTogMCxcbiAgICBjb3VudGVyOiAwLFxuICAgIFxuICAgIGlzQnVmZmVyaW5nOiBmdW5jdGlvbiAoY3VycmVudFRpbWUpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lID09IHRoaXMucHJldl9jdXJyZW50VGltZSkgdGhpcy5jb3VudGVyKys7XG4gICAgICAgIGVsc2UgdGhpcy5jb3VudGVyID0gMDtcbiAgICAgICAgdGhpcy5wcmV2X2N1cnJlbnRUaW1lID0gY3VycmVudFRpbWU7XG4gICAgICAgIGlmKHRoaXMuY291bnRlciA+IDEwKXtcbiAgICAgICAgICAgIC8vbm90IGxldCBjb3VudGVyIG92ZXJmbG93XG4gICAgICAgICAgICB0aGlzLmNvdW50ZXIgPSAxMDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBNb2JpbGVCdWZmZXJpbmc7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzQvMTYuXG4gKi9cblxudmFyIE5vdGljZSA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1ub3RpY2UtbGFiZWxcIjtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBpZih0eXBlb2Ygb3B0aW9ucy5Ob3RpY2VNZXNzYWdlID09IFwib2JqZWN0XCIpe1xuICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5lbCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgIH1lbHNlIGlmKHR5cGVvZiBvcHRpb25zLk5vdGljZU1lc3NhZ2UgPT0gXCJzdHJpbmdcIil7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5pbm5lckhUTUwgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IE5vdGljZTsiLCIvKipcbiAqIENyZWF0ZWQgYnkgdHJpc3RhbiBnZW11cyBvbiAwNi8xNy8yMDE3XG4gKi9cblxudmFyIE9yaWVudGF0aW9uSWNvbiA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1vcmllbnRhdGlvbi1pY29uXCI7XG5cbiAgICBmdW5jdGlvbiBnZXRPcmllbnRhdGlvbkRlZ3JlZXMoY2FudmFzKSB7XG4gICAgICAgIHZhciB2ZWN0b3IgPSBjYW52YXMuY2FtZXJhLmdldFdvcmxkRGlyZWN0aW9uKCk7XG4gICAgICAgIHZhciB0aGV0YSA9IE1hdGguYXRhbjIodmVjdG9yLngsIHZlY3Rvci56KTtcbiAgICAgICAgdmFyIHJhZCA9IE1hdGguUEkgLSB0aGV0YTtcbiAgICAgICAgdmFyIGRlZyA9IFRIUkVFLk1hdGgucmFkVG9EZWcocmFkKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBNYXRoLnJvdW5kKGRlZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdXNlckFjdGl2ZTogZmFsc2UsXG5cbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIG1vdXNlSGFuZGxlcjogZnVuY3Rpb24oY2FudmFzLCBlKSB7XG4gICAgICAgICAgICBzd2l0Y2goZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnbW91c2Vkb3duJzpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51c2VyQWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbW91c2V1cCc6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXNlckFjdGl2ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdtb3VzZW1vdmUnOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZShjYW52YXMsIGUpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBpbml0RXZlbnRzOiBmdW5jdGlvbihjYW52YXMpIHtcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdkZXZpY2Vtb3Rpb24nLCB0aGlzLnVwZGF0ZS5iaW5kKHRoaXMsIGNhbnZhcykpO1xuXG4gICAgICAgICAgICB2YXIgbW91c2VFdmVudHMgPSBbJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ21vdXNlbW92ZSddO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gbW91c2VFdmVudHMpIHtcbiAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihtb3VzZUV2ZW50c1trZXldLCB0aGlzLm1vdXNlSGFuZGxlci5iaW5kKHRoaXMsIGNhbnZhcykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHVwZGF0ZTogZnVuY3Rpb24gKGNhbnZhcywgb2JqZWN0KSB7XG4gICAgICAgICAgICB2YXIgZGVncmVlcyA9IGdldE9yaWVudGF0aW9uRGVncmVlcyhjYW52YXMpICsgOTA7XG4gICAgICAgICAgICB0aGlzLmVsKCkuc3R5bGUudHJhbnNmb3JtID0gJ3JvdGF0ZSgnICsgZGVncmVlcyArICdkZWcpJztcbiAgICAgICAgfSxcblxuICAgICAgICBlbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBPcmllbnRhdGlvbkljb247IiwiLyoqXG4gKlxuICogKGMpIFdlbnNoZW5nIFlhbiA8eWFud3NoQGdtYWlsLmNvbT5cbiAqIERhdGU6IDEwLzIxLzE2XG4gKlxuICogRm9yIHRoZSBmdWxsIGNvcHlyaWdodCBhbmQgbGljZW5zZSBpbmZvcm1hdGlvbiwgcGxlYXNlIHZpZXcgdGhlIExJQ0VOU0VcbiAqIGZpbGUgdGhhdCB3YXMgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzIHNvdXJjZSBjb2RlLlxuICovXG4ndXNlIHN0cmljdCc7XG5cbmltcG9ydCBCYXNlQ2FudmFzIGZyb20gJy4vQmFzZUNhbnZhcyc7XG5pbXBvcnQgVXRpbCBmcm9tICcuL1V0aWwnO1xuXG52YXIgVGhyZWVEQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyA9IHt9KXtcbiAgICB2YXIgcGFyZW50ID0gQmFzZUNhbnZhcyhiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MpO1xuICAgIHJldHVybiBVdGlsLmV4dGVuZChwYXJlbnQsIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHBhcmVudC5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgICAgICAvL29ubHkgc2hvdyBsZWZ0IHBhcnQgYnkgZGVmYXVsdFxuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIC8vZGVmaW5lIHNjZW5lXG4gICAgICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG5cbiAgICAgICAgICAgIHZhciBhc3BlY3RSYXRpbyA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIC8vZGVmaW5lIGNhbWVyYVxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKG9wdGlvbnMuaW5pdEZvdiwgYXNwZWN0UmF0aW8sIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCAwLCAwLCAwICk7XG5cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUiA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShvcHRpb25zLmluaXRGb3YsIGFzcGVjdFJhdGlvIC8gMiwgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIucG9zaXRpb24uc2V0KCAxMDAwLCAwLCAwICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDEwMDAsIDAsIDAgKTtcblxuICAgICAgICAgICAgdmFyIGdlb21ldHJ5TCA9IG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSg1MDAsIDYwLCA0MCkudG9Ob25JbmRleGVkKCk7XG4gICAgICAgICAgICB2YXIgZ2VvbWV0cnlSID0gbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KDUwMCwgNjAsIDQwKS50b05vbkluZGV4ZWQoKTtcblxuICAgICAgICAgICAgdmFyIHV2c0wgPSBnZW9tZXRyeUwuYXR0cmlidXRlcy51di5hcnJheTtcbiAgICAgICAgICAgIHZhciBub3JtYWxzTCA9IGdlb21ldHJ5TC5hdHRyaWJ1dGVzLm5vcm1hbC5hcnJheTtcbiAgICAgICAgICAgIGZvciAoIHZhciBpID0gMDsgaSA8IG5vcm1hbHNMLmxlbmd0aCAvIDM7IGkgKysgKSB7XG4gICAgICAgICAgICAgICAgdXZzTFsgaSAqIDIgKyAxIF0gPSB1dnNMWyBpICogMiArIDEgXSAvIDI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB1dnNSID0gZ2VvbWV0cnlSLmF0dHJpYnV0ZXMudXYuYXJyYXk7XG4gICAgICAgICAgICB2YXIgbm9ybWFsc1IgPSBnZW9tZXRyeVIuYXR0cmlidXRlcy5ub3JtYWwuYXJyYXk7XG4gICAgICAgICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBub3JtYWxzUi5sZW5ndGggLyAzOyBpICsrICkge1xuICAgICAgICAgICAgICAgIHV2c1JbIGkgKiAyICsgMSBdID0gdXZzUlsgaSAqIDIgKyAxIF0gLyAyICsgMC41O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBnZW9tZXRyeUwuc2NhbGUoIC0gMSwgMSwgMSApO1xuICAgICAgICAgICAgZ2VvbWV0cnlSLnNjYWxlKCAtIDEsIDEsIDEgKTtcblxuICAgICAgICAgICAgdGhpcy5tZXNoTCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5TCxcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRoaXMudGV4dHVyZX0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICB0aGlzLm1lc2hSID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnlSLFxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGhpcy50ZXh0dXJlfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aGlzLm1lc2hSLnBvc2l0aW9uLnNldCgxMDAwLCAwLCAwKTtcblxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoTCk7XG5cbiAgICAgICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVSZXNpemUuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHZhciBhc3BlY3RSYXRpbyA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIGlmKCF0aGlzLlZSTW9kZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5hc3BlY3QgPSBhc3BlY3RSYXRpbztcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgYXNwZWN0UmF0aW8gLz0gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuYXNwZWN0ID0gYXNwZWN0UmF0aW87XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmFzcGVjdCA9IGFzcGVjdFJhdGlvO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBwYXJlbnQuaGFuZGxlTW91c2VXaGVlbChldmVudCk7XG4gICAgICAgICAgICAvLyBXZWJLaXRcbiAgICAgICAgICAgIGlmICggZXZlbnQud2hlZWxEZWx0YVkgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgLT0gZXZlbnQud2hlZWxEZWx0YSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gRmlyZWZveFxuICAgICAgICAgICAgfSBlbHNlIGlmICggZXZlbnQuZGV0YWlsICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgKz0gZXZlbnQuZGV0YWlsICogMS4wO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYUwuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgPSBNYXRoLm1heCh0aGlzLnNldHRpbmdzLm1pbkZvdiwgdGhpcy5jYW1lcmFMLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgaWYodGhpcy5WUk1vZGUpe1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5mb3YgPSB0aGlzLmNhbWVyYUwuZm92O1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgZW5hYmxlVlI6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoUik7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZVJlc2l6ZSgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGRpc2FibGVWUjogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUodGhpcy5tZXNoUik7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZVJlc2l6ZSgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHBhcmVudC5yZW5kZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC50YXJnZXQueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC50YXJnZXQueSA9IDUwMCAqIE1hdGguY29zKCB0aGlzLnBoaSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnRhcmdldC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmxvb2tBdCh0aGlzLmNhbWVyYUwudGFyZ2V0KTtcblxuICAgICAgICAgICAgaWYodGhpcy5WUk1vZGUpe1xuICAgICAgICAgICAgICAgIHZhciB2aWV3UG9ydFdpZHRoID0gdGhpcy53aWR0aCAvIDIsIHZpZXdQb3J0SGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnRhcmdldC54ID0gMTAwMCArIDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0LnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmxvb2tBdCggdGhpcy5jYW1lcmFSLnRhcmdldCApO1xuXG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyIGxlZnQgZXllXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIDAsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhTCApO1xuXG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyIHJpZ2h0IGV5ZVxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIHZpZXdQb3J0V2lkdGgsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYVIgKTtcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYUwgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgVGhyZWVEQ2FudmFzOyIsIi8qKlxuICogQ3JlYXRlZCBieSB3ZW5zaGVuZy55YW4gb24gNC80LzE2LlxuICovXG5mdW5jdGlvbiB3aGljaFRyYW5zaXRpb25FdmVudCgpe1xuICAgIHZhciB0O1xuICAgIHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zha2VlbGVtZW50Jyk7XG4gICAgdmFyIHRyYW5zaXRpb25zID0ge1xuICAgICAgICAndHJhbnNpdGlvbic6J3RyYW5zaXRpb25lbmQnLFxuICAgICAgICAnT1RyYW5zaXRpb24nOidvVHJhbnNpdGlvbkVuZCcsXG4gICAgICAgICdNb3pUcmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdXZWJraXRUcmFuc2l0aW9uJzond2Via2l0VHJhbnNpdGlvbkVuZCdcbiAgICB9O1xuXG4gICAgZm9yKHQgaW4gdHJhbnNpdGlvbnMpe1xuICAgICAgICBpZiggZWwuc3R5bGVbdF0gIT09IHVuZGVmaW5lZCApe1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zaXRpb25zW3RdO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtb2JpbGVBbmRUYWJsZXRjaGVjaygpIHtcbiAgICB2YXIgY2hlY2sgPSBmYWxzZTtcbiAgICAoZnVuY3Rpb24oYSl7aWYoLyhhbmRyb2lkfGJiXFxkK3xtZWVnbykuK21vYmlsZXxhdmFudGdvfGJhZGFcXC98YmxhY2tiZXJyeXxibGF6ZXJ8Y29tcGFsfGVsYWluZXxmZW5uZWN8aGlwdG9wfGllbW9iaWxlfGlwKGhvbmV8b2QpfGlyaXN8a2luZGxlfGxnZSB8bWFlbW98bWlkcHxtbXB8bW9iaWxlLitmaXJlZm94fG5ldGZyb250fG9wZXJhIG0ob2J8aW4paXxwYWxtKCBvcyk/fHBob25lfHAoaXhpfHJlKVxcL3xwbHVja2VyfHBvY2tldHxwc3B8c2VyaWVzKDR8NikwfHN5bWJpYW58dHJlb3x1cFxcLihicm93c2VyfGxpbmspfHZvZGFmb25lfHdhcHx3aW5kb3dzIGNlfHhkYXx4aWlub3xhbmRyb2lkfGlwYWR8cGxheWJvb2t8c2lsay9pLnRlc3QoYSl8fC8xMjA3fDYzMTB8NjU5MHwzZ3NvfDR0aHB8NTBbMS02XWl8Nzcwc3w4MDJzfGEgd2F8YWJhY3xhYyhlcnxvb3xzXFwtKXxhaShrb3xybil8YWwoYXZ8Y2F8Y28pfGFtb2l8YW4oZXh8bnl8eXcpfGFwdHV8YXIoY2h8Z28pfGFzKHRlfHVzKXxhdHR3fGF1KGRpfFxcLW18ciB8cyApfGF2YW58YmUoY2t8bGx8bnEpfGJpKGxifHJkKXxibChhY3xheil8YnIoZXx2KXd8YnVtYnxid1xcLShufHUpfGM1NVxcL3xjYXBpfGNjd2F8Y2RtXFwtfGNlbGx8Y2h0bXxjbGRjfGNtZFxcLXxjbyhtcHxuZCl8Y3Jhd3xkYShpdHxsbHxuZyl8ZGJ0ZXxkY1xcLXN8ZGV2aXxkaWNhfGRtb2J8ZG8oY3xwKW98ZHMoMTJ8XFwtZCl8ZWwoNDl8YWkpfGVtKGwyfHVsKXxlcihpY3xrMCl8ZXNsOHxleihbNC03XTB8b3N8d2F8emUpfGZldGN8Zmx5KFxcLXxfKXxnMSB1fGc1NjB8Z2VuZXxnZlxcLTV8Z1xcLW1vfGdvKFxcLnd8b2QpfGdyKGFkfHVuKXxoYWllfGhjaXR8aGRcXC0obXxwfHQpfGhlaVxcLXxoaShwdHx0YSl8aHAoIGl8aXApfGhzXFwtY3xodChjKFxcLXwgfF98YXxnfHB8c3x0KXx0cCl8aHUoYXd8dGMpfGlcXC0oMjB8Z298bWEpfGkyMzB8aWFjKCB8XFwtfFxcLyl8aWJyb3xpZGVhfGlnMDF8aWtvbXxpbTFrfGlubm98aXBhcXxpcmlzfGphKHR8dilhfGpicm98amVtdXxqaWdzfGtkZGl8a2VqaXxrZ3QoIHxcXC8pfGtsb258a3B0IHxrd2NcXC18a3lvKGN8ayl8bGUobm98eGkpfGxnKCBnfFxcLyhrfGx8dSl8NTB8NTR8XFwtW2Etd10pfGxpYnd8bHlueHxtMVxcLXd8bTNnYXxtNTBcXC98bWEodGV8dWl8eG8pfG1jKDAxfDIxfGNhKXxtXFwtY3J8bWUocmN8cmkpfG1pKG84fG9hfHRzKXxtbWVmfG1vKDAxfDAyfGJpfGRlfGRvfHQoXFwtfCB8b3x2KXx6eil8bXQoNTB8cDF8diApfG13YnB8bXl3YXxuMTBbMC0yXXxuMjBbMi0zXXxuMzAoMHwyKXxuNTAoMHwyfDUpfG43KDAoMHwxKXwxMCl8bmUoKGN8bSlcXC18b258dGZ8d2Z8d2d8d3QpfG5vayg2fGkpfG56cGh8bzJpbXxvcCh0aXx3dil8b3Jhbnxvd2cxfHA4MDB8cGFuKGF8ZHx0KXxwZHhnfHBnKDEzfFxcLShbMS04XXxjKSl8cGhpbHxwaXJlfHBsKGF5fHVjKXxwblxcLTJ8cG8oY2t8cnR8c2UpfHByb3h8cHNpb3xwdFxcLWd8cWFcXC1hfHFjKDA3fDEyfDIxfDMyfDYwfFxcLVsyLTddfGlcXC0pfHF0ZWt8cjM4MHxyNjAwfHJha3N8cmltOXxybyh2ZXx6byl8czU1XFwvfHNhKGdlfG1hfG1tfG1zfG55fHZhKXxzYygwMXxoXFwtfG9vfHBcXC0pfHNka1xcL3xzZShjKFxcLXwwfDEpfDQ3fG1jfG5kfHJpKXxzZ2hcXC18c2hhcnxzaWUoXFwtfG0pfHNrXFwtMHxzbCg0NXxpZCl8c20oYWx8YXJ8YjN8aXR8dDUpfHNvKGZ0fG55KXxzcCgwMXxoXFwtfHZcXC18diApfHN5KDAxfG1iKXx0MigxOHw1MCl8dDYoMDB8MTB8MTgpfHRhKGd0fGxrKXx0Y2xcXC18dGRnXFwtfHRlbChpfG0pfHRpbVxcLXx0XFwtbW98dG8ocGx8c2gpfHRzKDcwfG1cXC18bTN8bTUpfHR4XFwtOXx1cChcXC5ifGcxfHNpKXx1dHN0fHY0MDB8djc1MHx2ZXJpfHZpKHJnfHRlKXx2ayg0MHw1WzAtM118XFwtdil8dm00MHx2b2RhfHZ1bGN8dngoNTJ8NTN8NjB8NjF8NzB8ODB8ODF8ODN8ODV8OTgpfHczYyhcXC18ICl8d2ViY3x3aGl0fHdpKGcgfG5jfG53KXx3bWxifHdvbnV8eDcwMHx5YXNcXC18eW91cnx6ZXRvfHp0ZVxcLS9pLnRlc3QoYS5zdWJzdHIoMCw0KSkpY2hlY2sgPSB0cnVlfSkobmF2aWdhdG9yLnVzZXJBZ2VudHx8bmF2aWdhdG9yLnZlbmRvcnx8d2luZG93Lm9wZXJhKTtcbiAgICByZXR1cm4gY2hlY2s7XG59XG5cbmZ1bmN0aW9uIGlzSW9zKCkge1xuICAgIHJldHVybiAvaVBob25lfGlQYWR8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG59XG5cbmZ1bmN0aW9uIGlzUmVhbElwaG9uZSgpIHtcbiAgICByZXR1cm4gL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pO1xufVxuXG4vL2Fkb3B0IGNvZGUgZnJvbTogaHR0cHM6Ly9naXRodWIuY29tL01velZSL3ZyLXdlYi1leGFtcGxlcy9ibG9iL21hc3Rlci90aHJlZWpzLXZyLWJvaWxlcnBsYXRlL2pzL1ZSRWZmZWN0LmpzXG5mdW5jdGlvbiBmb3ZUb05EQ1NjYWxlT2Zmc2V0KCBmb3YgKSB7XG4gICAgdmFyIHB4c2NhbGUgPSAyLjAgLyAoZm92LmxlZnRUYW4gKyBmb3YucmlnaHRUYW4pO1xuICAgIHZhciBweG9mZnNldCA9IChmb3YubGVmdFRhbiAtIGZvdi5yaWdodFRhbikgKiBweHNjYWxlICogMC41O1xuICAgIHZhciBweXNjYWxlID0gMi4wIC8gKGZvdi51cFRhbiArIGZvdi5kb3duVGFuKTtcbiAgICB2YXIgcHlvZmZzZXQgPSAoZm92LnVwVGFuIC0gZm92LmRvd25UYW4pICogcHlzY2FsZSAqIDAuNTtcbiAgICByZXR1cm4geyBzY2FsZTogWyBweHNjYWxlLCBweXNjYWxlIF0sIG9mZnNldDogWyBweG9mZnNldCwgcHlvZmZzZXQgXSB9O1xufVxuXG5mdW5jdGlvbiBmb3ZQb3J0VG9Qcm9qZWN0aW9uKCBmb3YsIHJpZ2h0SGFuZGVkLCB6TmVhciwgekZhciApIHtcblxuICAgIHJpZ2h0SGFuZGVkID0gcmlnaHRIYW5kZWQgPT09IHVuZGVmaW5lZCA/IHRydWUgOiByaWdodEhhbmRlZDtcbiAgICB6TmVhciA9IHpOZWFyID09PSB1bmRlZmluZWQgPyAwLjAxIDogek5lYXI7XG4gICAgekZhciA9IHpGYXIgPT09IHVuZGVmaW5lZCA/IDEwMDAwLjAgOiB6RmFyO1xuXG4gICAgdmFyIGhhbmRlZG5lc3NTY2FsZSA9IHJpZ2h0SGFuZGVkID8gLTEuMCA6IDEuMDtcblxuICAgIC8vIHN0YXJ0IHdpdGggYW4gaWRlbnRpdHkgbWF0cml4XG4gICAgdmFyIG1vYmogPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICAgIHZhciBtID0gbW9iai5lbGVtZW50cztcblxuICAgIC8vIGFuZCB3aXRoIHNjYWxlL29mZnNldCBpbmZvIGZvciBub3JtYWxpemVkIGRldmljZSBjb29yZHNcbiAgICB2YXIgc2NhbGVBbmRPZmZzZXQgPSBmb3ZUb05EQ1NjYWxlT2Zmc2V0KGZvdik7XG5cbiAgICAvLyBYIHJlc3VsdCwgbWFwIGNsaXAgZWRnZXMgdG8gWy13LCt3XVxuICAgIG1bMCAqIDQgKyAwXSA9IHNjYWxlQW5kT2Zmc2V0LnNjYWxlWzBdO1xuICAgIG1bMCAqIDQgKyAxXSA9IDAuMDtcbiAgICBtWzAgKiA0ICsgMl0gPSBzY2FsZUFuZE9mZnNldC5vZmZzZXRbMF0gKiBoYW5kZWRuZXNzU2NhbGU7XG4gICAgbVswICogNCArIDNdID0gMC4wO1xuXG4gICAgLy8gWSByZXN1bHQsIG1hcCBjbGlwIGVkZ2VzIHRvIFstdywrd11cbiAgICAvLyBZIG9mZnNldCBpcyBuZWdhdGVkIGJlY2F1c2UgdGhpcyBwcm9qIG1hdHJpeCB0cmFuc2Zvcm1zIGZyb20gd29ybGQgY29vcmRzIHdpdGggWT11cCxcbiAgICAvLyBidXQgdGhlIE5EQyBzY2FsaW5nIGhhcyBZPWRvd24gKHRoYW5rcyBEM0Q/KVxuICAgIG1bMSAqIDQgKyAwXSA9IDAuMDtcbiAgICBtWzEgKiA0ICsgMV0gPSBzY2FsZUFuZE9mZnNldC5zY2FsZVsxXTtcbiAgICBtWzEgKiA0ICsgMl0gPSAtc2NhbGVBbmRPZmZzZXQub2Zmc2V0WzFdICogaGFuZGVkbmVzc1NjYWxlO1xuICAgIG1bMSAqIDQgKyAzXSA9IDAuMDtcblxuICAgIC8vIFogcmVzdWx0ICh1cCB0byB0aGUgYXBwKVxuICAgIG1bMiAqIDQgKyAwXSA9IDAuMDtcbiAgICBtWzIgKiA0ICsgMV0gPSAwLjA7XG4gICAgbVsyICogNCArIDJdID0gekZhciAvICh6TmVhciAtIHpGYXIpICogLWhhbmRlZG5lc3NTY2FsZTtcbiAgICBtWzIgKiA0ICsgM10gPSAoekZhciAqIHpOZWFyKSAvICh6TmVhciAtIHpGYXIpO1xuXG4gICAgLy8gVyByZXN1bHQgKD0gWiBpbilcbiAgICBtWzMgKiA0ICsgMF0gPSAwLjA7XG4gICAgbVszICogNCArIDFdID0gMC4wO1xuICAgIG1bMyAqIDQgKyAyXSA9IGhhbmRlZG5lc3NTY2FsZTtcbiAgICBtWzMgKiA0ICsgM10gPSAwLjA7XG5cbiAgICBtb2JqLnRyYW5zcG9zZSgpO1xuXG4gICAgcmV0dXJuIG1vYmo7XG59XG5cbmZ1bmN0aW9uIGZvdlRvUHJvamVjdGlvbiggZm92LCByaWdodEhhbmRlZCwgek5lYXIsIHpGYXIgKSB7XG4gICAgdmFyIERFRzJSQUQgPSBNYXRoLlBJIC8gMTgwLjA7XG5cbiAgICB2YXIgZm92UG9ydCA9IHtcbiAgICAgICAgdXBUYW46IE1hdGgudGFuKCBmb3YudXBEZWdyZWVzICogREVHMlJBRCApLFxuICAgICAgICBkb3duVGFuOiBNYXRoLnRhbiggZm92LmRvd25EZWdyZWVzICogREVHMlJBRCApLFxuICAgICAgICBsZWZ0VGFuOiBNYXRoLnRhbiggZm92LmxlZnREZWdyZWVzICogREVHMlJBRCApLFxuICAgICAgICByaWdodFRhbjogTWF0aC50YW4oIGZvdi5yaWdodERlZ3JlZXMgKiBERUcyUkFEIClcbiAgICB9O1xuXG4gICAgcmV0dXJuIGZvdlBvcnRUb1Byb2plY3Rpb24oIGZvdlBvcnQsIHJpZ2h0SGFuZGVkLCB6TmVhciwgekZhciApO1xufVxuXG5mdW5jdGlvbiBleHRlbmQoc3VwZXJDbGFzcywgc3ViQ2xhc3NNZXRob2RzID0ge30pXG57XG4gICAgZm9yKHZhciBtZXRob2QgaW4gc3VwZXJDbGFzcyl7XG4gICAgICAgIGlmKHN1cGVyQ2xhc3MuaGFzT3duUHJvcGVydHkobWV0aG9kKSAmJiAhc3ViQ2xhc3NNZXRob2RzLmhhc093blByb3BlcnR5KG1ldGhvZCkpe1xuICAgICAgICAgICAgc3ViQ2xhc3NNZXRob2RzW21ldGhvZF0gPSBzdXBlckNsYXNzW21ldGhvZF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN1YkNsYXNzTWV0aG9kcztcbn1cblxuZnVuY3Rpb24gZGVlcENvcHkob2JqKSB7XG4gICAgdmFyIHRvID0ge307XG5cbiAgICBmb3IgKHZhciBuYW1lIGluIG9iailcbiAgICB7XG4gICAgICAgIHRvW25hbWVdID0gb2JqW25hbWVdO1xuICAgIH1cblxuICAgIHJldHVybiB0bztcbn1cblxuZnVuY3Rpb24gZ2V0VG91Y2hlc0Rpc3RhbmNlKHRvdWNoZXMpe1xuICAgIHJldHVybiBNYXRoLnNxcnQoXG4gICAgICAgICh0b3VjaGVzWzBdLmNsaWVudFgtdG91Y2hlc1sxXS5jbGllbnRYKSAqICh0b3VjaGVzWzBdLmNsaWVudFgtdG91Y2hlc1sxXS5jbGllbnRYKSArXG4gICAgICAgICh0b3VjaGVzWzBdLmNsaWVudFktdG91Y2hlc1sxXS5jbGllbnRZKSAqICh0b3VjaGVzWzBdLmNsaWVudFktdG91Y2hlc1sxXS5jbGllbnRZKSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgICB3aGljaFRyYW5zaXRpb25FdmVudDogd2hpY2hUcmFuc2l0aW9uRXZlbnQsXG4gICAgbW9iaWxlQW5kVGFibGV0Y2hlY2s6IG1vYmlsZUFuZFRhYmxldGNoZWNrLFxuICAgIGlzSW9zOiBpc0lvcyxcbiAgICBpc1JlYWxJcGhvbmU6IGlzUmVhbElwaG9uZSxcbiAgICBmb3ZUb1Byb2plY3Rpb246IGZvdlRvUHJvamVjdGlvbixcbiAgICBleHRlbmQ6IGV4dGVuZCxcbiAgICBkZWVwQ29weTogZGVlcENvcHksXG4gICAgZ2V0VG91Y2hlc0Rpc3RhbmNlOiBnZXRUb3VjaGVzRGlzdGFuY2Vcbn07IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA4LzEzLzE2LlxuICovXG5cbnZhciBWUkJ1dHRvbiA9IGZ1bmN0aW9uKEJ1dHRvbkNvbXBvbmVudCl7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIEJ1dHRvbkNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYnVpbGRDU1NDbGFzczogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gYHZqcy1WUi1jb250cm9sICR7QnV0dG9uQ29tcG9uZW50LnByb3RvdHlwZS5idWlsZENTU0NsYXNzLmNhbGwodGhpcyl9YDtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVDbGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGNhbnZhcyA9IHRoaXMucGxheWVyKCkuZ2V0Q2hpbGQoXCJDYW52YXNcIik7XG4gICAgICAgICAgICAoIWNhbnZhcy5WUk1vZGUpPyBjYW52YXMuZW5hYmxlVlIoKSA6IGNhbnZhcy5kaXNhYmxlVlIoKTtcbiAgICAgICAgICAgIChjYW52YXMuVlJNb2RlKT8gdGhpcy5hZGRDbGFzcyhcImVuYWJsZVwiKSA6IHRoaXMucmVtb3ZlQ2xhc3MoXCJlbmFibGVcIik7XG4gICAgICAgICAgICAoY2FudmFzLlZSTW9kZSk/ICB0aGlzLnBsYXllcigpLnRyaWdnZXIoJ1ZSTW9kZU9uJyk6ICB0aGlzLnBsYXllcigpLnRyaWdnZXIoJ1ZSTW9kZU9mZicpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNvbnRyb2xUZXh0XzogXCJWUlwiXG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgVlJCdXR0b247IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzMvMTYuXG4gKi9cbid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IHV0aWwgZnJvbSAnLi9saWIvVXRpbCc7XG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi9saWIvRGV0ZWN0b3InO1xuaW1wb3J0IG1ha2VWaWRlb1BsYXlhYmxlSW5saW5lIGZyb20gJ2lwaG9uZS1pbmxpbmUtdmlkZW8nO1xuXG5jb25zdCBydW5Pbk1vYmlsZSA9ICh1dGlsLm1vYmlsZUFuZFRhYmxldGNoZWNrKCkpO1xuXG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHRoZSBwbHVnaW4uXG5jb25zdCBkZWZhdWx0cyA9IHtcbiAgICBjbGlja0FuZERyYWc6IHJ1bk9uTW9iaWxlLFxuICAgIHNob3dOb3RpY2U6IHRydWUsXG4gICAgTm90aWNlTWVzc2FnZTogXCJQbGVhc2UgdXNlIHlvdXIgbW91c2UgZHJhZyBhbmQgZHJvcCB0aGUgdmlkZW8uXCIsXG4gICAgYXV0b0hpZGVOb3RpY2U6IDMwMDAsXG4gICAgLy9saW1pdCB0aGUgdmlkZW8gc2l6ZSB3aGVuIHVzZXIgc2Nyb2xsLlxuICAgIHNjcm9sbGFibGU6IHRydWUsXG4gICAgaW5pdEZvdjogNzUsXG4gICAgbWF4Rm92OiAxMDUsXG4gICAgbWluRm92OiA1MSxcbiAgICAvL2luaXRpYWwgcG9zaXRpb24gZm9yIHRoZSB2aWRlb1xuICAgIGluaXRMYXQ6IDAsXG4gICAgaW5pdExvbjogLTE4MCxcbiAgICAvL0EgZmxvYXQgdmFsdWUgYmFjayB0byBjZW50ZXIgd2hlbiBtb3VzZSBvdXQgdGhlIGNhbnZhcy4gVGhlIGhpZ2hlciwgdGhlIGZhc3Rlci5cbiAgICByZXR1cm5TdGVwTGF0OiAwLjUsXG4gICAgcmV0dXJuU3RlcExvbjogMixcbiAgICBiYWNrVG9WZXJ0aWNhbENlbnRlcjogIXJ1bk9uTW9iaWxlLFxuICAgIGJhY2tUb0hvcml6b25DZW50ZXI6ICFydW5Pbk1vYmlsZSxcbiAgICBjbGlja1RvVG9nZ2xlOiBmYWxzZSxcblxuICAgIC8vbGltaXQgdmlld2FibGUgem9vbVxuICAgIG1pbkxhdDogLTg1LFxuICAgIG1heExhdDogODUsXG5cbiAgICBtaW5Mb246IC1JbmZpbml0eSxcbiAgICBtYXhMb246IEluZmluaXR5LFxuXG4gICAgdmlkZW9UeXBlOiBcImVxdWlyZWN0YW5ndWxhclwiLFxuXG4gICAgcm90YXRlWDogMCxcbiAgICByb3RhdGVZOiAwLFxuICAgIHJvdGF0ZVo6IDAsXG5cbiAgICBhdXRvTW9iaWxlT3JpZW50YXRpb246IGZhbHNlLFxuICAgIG1vYmlsZVZpYnJhdGlvblZhbHVlOiB1dGlsLmlzSW9zKCk/IDAuMDIyIDogMSxcblxuICAgIFZSRW5hYmxlOiB0cnVlLFxuICAgIFZSR2FwRGVncmVlOiAyLjUsXG5cbiAgICBjbG9zZVBhbm9yYW1hOiBmYWxzZSxcblxuICAgIGhlbHBlckNhbnZhczoge30sXG5cbiAgICBkdWFsRmlzaDoge1xuICAgICAgICB3aWR0aDogMTkyMCxcbiAgICAgICAgaGVpZ2h0OiAxMDgwLFxuICAgICAgICBjaXJjbGUxOiB7XG4gICAgICAgICAgICB4OiAwLjI0MDYyNSxcbiAgICAgICAgICAgIHk6IDAuNTUzNzA0LFxuICAgICAgICAgICAgcng6IDAuMjMzMzMsXG4gICAgICAgICAgICByeTogMC40MzE0OCxcbiAgICAgICAgICAgIGNvdmVyWDogMC45MTMsXG4gICAgICAgICAgICBjb3Zlclk6IDAuOVxuICAgICAgICB9LFxuICAgICAgICBjaXJjbGUyOiB7XG4gICAgICAgICAgICB4OiAwLjc1NzI5MixcbiAgICAgICAgICAgIHk6IDAuNTUzNzA0LFxuICAgICAgICAgICAgcng6IDAuMjMyMjkyLFxuICAgICAgICAgICAgcnk6IDAuNDI5NjI5NixcbiAgICAgICAgICAgIGNvdmVyWDogMC45MTMsXG4gICAgICAgICAgICBjb3Zlclk6IDAuOTMwOFxuICAgICAgICB9XG4gICAgfVxufTtcblxuZnVuY3Rpb24gcGxheWVyUmVzaXplKHBsYXllcil7XG4gICAgdmFyIGNhbnZhcyA9IHBsYXllci5nZXRDaGlsZCgnQ2FudmFzJyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUud2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCArIFwicHhcIjtcbiAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUuaGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICBjYW52YXMuaGFuZGxlUmVzaXplKCk7XG4gICAgfTtcbn1cblxuZnVuY3Rpb24gZnVsbHNjcmVlbk9uSU9TKHBsYXllciwgY2xpY2tGbikge1xuICAgIHZhciByZXNpemVGbiA9IHBsYXllclJlc2l6ZShwbGF5ZXIpO1xuICAgIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUub2ZmKFwidGFwXCIsIGNsaWNrRm4pO1xuICAgIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUub24oXCJ0YXBcIiwgZnVuY3Rpb24gZnVsbHNjcmVlbigpIHtcbiAgICAgICAgdmFyIGNhbnZhcyA9IHBsYXllci5nZXRDaGlsZCgnQ2FudmFzJyk7XG4gICAgICAgIGlmKCFwbGF5ZXIuaXNGdWxsc2NyZWVuKCkpe1xuICAgICAgICAgICAgLy9zZXQgdG8gZnVsbHNjcmVlblxuICAgICAgICAgICAgcGxheWVyLmlzRnVsbHNjcmVlbih0cnVlKTtcbiAgICAgICAgICAgIHBsYXllci5lbnRlckZ1bGxXaW5kb3coKTtcbiAgICAgICAgICAgIHJlc2l6ZUZuKCk7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImRldmljZW1vdGlvblwiLCByZXNpemVGbik7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcGxheWVyLmlzRnVsbHNjcmVlbihmYWxzZSk7XG4gICAgICAgICAgICBwbGF5ZXIuZXhpdEZ1bGxXaW5kb3coKTtcbiAgICAgICAgICAgIHBsYXllci5lbCgpLnN0eWxlLndpZHRoID0gXCJcIjtcbiAgICAgICAgICAgIHBsYXllci5lbCgpLnN0eWxlLmhlaWdodCA9IFwiXCI7XG4gICAgICAgICAgICBjYW52YXMuaGFuZGxlUmVzaXplKCk7XG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImRldmljZW1vdGlvblwiLCByZXNpemVGbik7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuLyoqXG4gKiBGdW5jdGlvbiB0byBpbnZva2Ugd2hlbiB0aGUgcGxheWVyIGlzIHJlYWR5LlxuICpcbiAqIFRoaXMgaXMgYSBncmVhdCBwbGFjZSBmb3IgeW91ciBwbHVnaW4gdG8gaW5pdGlhbGl6ZSBpdHNlbGYuIFdoZW4gdGhpc1xuICogZnVuY3Rpb24gaXMgY2FsbGVkLCB0aGUgcGxheWVyIHdpbGwgaGF2ZSBpdHMgRE9NIGFuZCBjaGlsZCBjb21wb25lbnRzXG4gKiBpbiBwbGFjZS5cbiAqXG4gKiBAZnVuY3Rpb24gb25QbGF5ZXJSZWFkeVxuICogQHBhcmFtICAgIHtQbGF5ZXJ9IHBsYXllclxuICogQHBhcmFtICAgIHtPYmplY3R9IFtvcHRpb25zPXt9XVxuICovXG5jb25zdCBvblBsYXllclJlYWR5ID0gKHBsYXllciwgb3B0aW9ucywgc2V0dGluZ3MpID0+IHtcbiAgICBwbGF5ZXIuYWRkQ2xhc3MoJ3Zqcy1wYW5vcmFtYScpO1xuICAgIGlmKCFEZXRlY3Rvci53ZWJnbCl7XG4gICAgICAgIFBvcHVwTm90aWZpY2F0aW9uKHBsYXllciwge1xuICAgICAgICAgICAgTm90aWNlTWVzc2FnZTogRGV0ZWN0b3IuZ2V0V2ViR0xFcnJvck1lc3NhZ2UoKSxcbiAgICAgICAgICAgIGF1dG9IaWRlTm90aWNlOiBvcHRpb25zLmF1dG9IaWRlTm90aWNlXG4gICAgICAgIH0pO1xuICAgICAgICBpZihvcHRpb25zLmNhbGxiYWNrKXtcbiAgICAgICAgICAgIG9wdGlvbnMuY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHBsYXllci5hZGRDaGlsZCgnQ2FudmFzJywgdXRpbC5kZWVwQ29weShvcHRpb25zKSk7XG4gICAgdmFyIGNhbnZhcyA9IHBsYXllci5nZXRDaGlsZCgnQ2FudmFzJyk7XG4gICAgaWYocnVuT25Nb2JpbGUpe1xuICAgICAgICB2YXIgdmlkZW9FbGVtZW50ID0gc2V0dGluZ3MuZ2V0VGVjaChwbGF5ZXIpO1xuICAgICAgICBpZih1dGlsLmlzUmVhbElwaG9uZSgpKXtcbiAgICAgICAgICAgIC8vaW9zIDEwIHN1cHBvcnQgcGxheSB2aWRlbyBpbmxpbmVcbiAgICAgICAgICAgIHZpZGVvRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJwbGF5c2lubGluZVwiLCBcIlwiKTtcbiAgICAgICAgICAgIG1ha2VWaWRlb1BsYXlhYmxlSW5saW5lKHZpZGVvRWxlbWVudCwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodXRpbC5pc0lvcygpKXtcbiAgICAgICAgICAgIGZ1bGxzY3JlZW5PbklPUyhwbGF5ZXIsIHNldHRpbmdzLmdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuKHBsYXllcikpO1xuICAgICAgICB9XG4gICAgICAgIHBsYXllci5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvXCIpO1xuICAgICAgICBwbGF5ZXIucmVtb3ZlQ2xhc3MoXCJ2anMtdXNpbmctbmF0aXZlLWNvbnRyb2xzXCIpO1xuICAgICAgICBjYW52YXMucGxheU9uTW9iaWxlKCk7XG4gICAgfVxuXG4gICAgdmFyIGNhcmRib2FyZCA9IHBsYXllci5hZGRDaGlsZCgnQ2FyZGJvYXJkTWVzc2FnZScsIG9wdGlvbnMpO1xuXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZW1vdGlvbicsIGNhcmRib2FyZC5tYXliZURpc3BsYXkuYmluZChjYXJkYm9hcmQsIGNhbnZhcykpO1xuICAgIHBsYXllci5vbignVlJNb2RlT24nLCBjYXJkYm9hcmQubWF5YmVEaXNwbGF5LmJpbmQoY2FyZGJvYXJkLCBjYW52YXMpKTtcbiAgICBwbGF5ZXIub24oJ1ZSTW9kZU9mZicsIGNhcmRib2FyZC5tYXliZURpc3BsYXkuYmluZChjYXJkYm9hcmQsIGNhbnZhcykpO1xuXG4gICAgdmFyIG9yaWVudGF0aW9uSWNvbiA9IHBsYXllci5hZGRDaGlsZCgnT3JpZW50YXRpb25JY29uJywgb3B0aW9ucyk7XG4gICAgb3JpZW50YXRpb25JY29uLmluaXRFdmVudHMoY2FudmFzKTtcbiAgICAvLyB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZGV2aWNlbW90aW9uJywgb3JpZW50YXRpb25JY29uLnVwZGF0ZS5iaW5kKG9yaWVudGF0aW9uSWNvbiwgY2FudmFzKSk7XG5cbiAgICBpZihvcHRpb25zLnNob3dOb3RpY2Upe1xuICAgICAgICBwbGF5ZXIub24oXCJwbGF5aW5nXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBQb3B1cE5vdGlmaWNhdGlvbihwbGF5ZXIsIHV0aWwuZGVlcENvcHkob3B0aW9ucykpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYob3B0aW9ucy5WUkVuYWJsZSl7XG4gICAgICAgIHBsYXllci5jb250cm9sQmFyLmFkZENoaWxkKCdWUkJ1dHRvbicsIHt9LCBwbGF5ZXIuY29udHJvbEJhci5jaGlsZHJlbigpLmxlbmd0aCAtIDEpO1xuICAgIH1cbiAgICBjYW52YXMuaGlkZSgpO1xuICAgIHBsYXllci5vbihcInBsYXlcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICBjYW52YXMuc2hvdygpO1xuICAgIH0pO1xuICAgIHBsYXllci5vbihcImZ1bGxzY3JlZW5jaGFuZ2VcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICBjYW52YXMuaGFuZGxlUmVzaXplKCk7XG4gICAgfSk7XG4gICAgaWYob3B0aW9ucy5jYWxsYmFjaykgb3B0aW9ucy5jYWxsYmFjaygpO1xufTtcblxuY29uc3QgUG9wdXBOb3RpZmljYXRpb24gPSAocGxheWVyLCBvcHRpb25zID0ge1xuICAgIE5vdGljZU1lc3NhZ2U6IFwiXCJcbn0pID0+IHtcbiAgICB2YXIgbm90aWNlID0gcGxheWVyLmFkZENoaWxkKCdOb3RpY2UnLCBvcHRpb25zKTtcblxuICAgIGlmKG9wdGlvbnMuYXV0b0hpZGVOb3RpY2UgPiAwKXtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBub3RpY2UuYWRkQ2xhc3MoXCJ2anMtdmlkZW8tbm90aWNlLWZhZGVPdXRcIik7XG4gICAgICAgICAgICB2YXIgdHJhbnNpdGlvbkV2ZW50ID0gdXRpbC53aGljaFRyYW5zaXRpb25FdmVudCgpO1xuICAgICAgICAgICAgdmFyIGhpZGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbm90aWNlLmhpZGUoKTtcbiAgICAgICAgICAgICAgICBub3RpY2UucmVtb3ZlQ2xhc3MoXCJ2anMtdmlkZW8tbm90aWNlLWZhZGVPdXRcIik7XG4gICAgICAgICAgICAgICAgbm90aWNlLm9mZih0cmFuc2l0aW9uRXZlbnQsIGhpZGUpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIG5vdGljZS5vbih0cmFuc2l0aW9uRXZlbnQsIGhpZGUpO1xuICAgICAgICB9LCBvcHRpb25zLmF1dG9IaWRlTm90aWNlKTtcbiAgICB9XG59O1xuXG5jb25zdCBwbHVnaW4gPSBmdW5jdGlvbihzZXR0aW5ncyA9IHt9KXtcbiAgICAvKipcbiAgICAgKiBBIHZpZGVvLmpzIHBsdWdpbi5cbiAgICAgKlxuICAgICAqIEluIHRoZSBwbHVnaW4gZnVuY3Rpb24sIHRoZSB2YWx1ZSBvZiBgdGhpc2AgaXMgYSB2aWRlby5qcyBgUGxheWVyYFxuICAgICAqIGluc3RhbmNlLiBZb3UgY2Fubm90IHJlbHkgb24gdGhlIHBsYXllciBiZWluZyBpbiBhIFwicmVhZHlcIiBzdGF0ZSBoZXJlLFxuICAgICAqIGRlcGVuZGluZyBvbiBob3cgdGhlIHBsdWdpbiBpcyBpbnZva2VkLiBUaGlzIG1heSBvciBtYXkgbm90IGJlIGltcG9ydGFudFxuICAgICAqIHRvIHlvdTsgaWYgbm90LCByZW1vdmUgdGhlIHdhaXQgZm9yIFwicmVhZHlcIiFcbiAgICAgKlxuICAgICAqIEBmdW5jdGlvbiBwYW5vcmFtYVxuICAgICAqIEBwYXJhbSAgICB7T2JqZWN0fSBbb3B0aW9ucz17fV1cbiAgICAgKiAgICAgICAgICAgQW4gb2JqZWN0IG9mIG9wdGlvbnMgbGVmdCB0byB0aGUgcGx1Z2luIGF1dGhvciB0byBkZWZpbmUuXG4gICAgICovXG4gICAgY29uc3QgdmlkZW9UeXBlcyA9IFtcImVxdWlyZWN0YW5ndWxhclwiLCBcImZpc2hleWVcIiwgXCIzZFZpZGVvXCIsIFwiZHVhbF9maXNoZXllXCJdO1xuICAgIGNvbnN0IHBhbm9yYW1hID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICBpZihzZXR0aW5ncy5tZXJnZU9wdGlvbikgb3B0aW9ucyA9IHNldHRpbmdzLm1lcmdlT3B0aW9uKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICAgICAgaWYodHlwZW9mIHNldHRpbmdzLl9pbml0ID09PSBcInVuZGVmaW5lZFwiIHx8IHR5cGVvZiBzZXR0aW5ncy5faW5pdCAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwicGx1Z2luIG11c3QgaW1wbGVtZW50IGluaXQgZnVuY3Rpb24oKS5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYodmlkZW9UeXBlcy5pbmRleE9mKG9wdGlvbnMudmlkZW9UeXBlKSA9PSAtMSkgb3B0aW9ucy52aWRlb1R5cGUgPSBkZWZhdWx0cy52aWRlb1R5cGU7XG4gICAgICAgIHNldHRpbmdzLl9pbml0KG9wdGlvbnMpO1xuICAgICAgICAvKiBpbXBsZW1lbnQgY2FsbGJhY2sgZnVuY3Rpb24gd2hlbiB2aWRlb2pzIGlzIHJlYWR5ICovXG4gICAgICAgIHRoaXMucmVhZHkoKCkgPT4ge1xuICAgICAgICAgICAgb25QbGF5ZXJSZWFkeSh0aGlzLCBvcHRpb25zLCBzZXR0aW5ncyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbi8vIEluY2x1ZGUgdGhlIHZlcnNpb24gbnVtYmVyLlxuICAgIHBhbm9yYW1hLlZFUlNJT04gPSAnMC4xLjYnO1xuXG4gICAgcmV0dXJuIHBhbm9yYW1hO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgcGx1Z2luO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgQ2FudmFzICBmcm9tICcuL2xpYi9DYW52YXMnO1xuaW1wb3J0IFRocmVlRENhbnZhcyBmcm9tICcuL2xpYi9UaHJlZUNhbnZhcyc7XG5pbXBvcnQgTm90aWNlICBmcm9tICcuL2xpYi9Ob3RpY2UnO1xuaW1wb3J0IEhlbHBlckNhbnZhcyBmcm9tICcuL2xpYi9IZWxwZXJDYW52YXMnO1xuaW1wb3J0IFZSQnV0dG9uIGZyb20gJy4vbGliL1ZSQnV0dG9uJztcbmltcG9ydCBDYXJkYm9hcmRNZXNzYWdlIGZyb20gJy4vbGliL0NhcmRib2FyZE1lc3NhZ2UnO1xuaW1wb3J0IE9yaWVudGF0aW9uSWNvbiBmcm9tICcuL2xpYi9PcmllbnRhdGlvbkljb24nO1xuaW1wb3J0IHBhbm9yYW1hIGZyb20gJy4vcGx1Z2luJztcblxuZnVuY3Rpb24gZ2V0VGVjaChwbGF5ZXIpIHtcbiAgICByZXR1cm4gcGxheWVyLnRlY2goeyBJV2lsbE5vdFVzZVRoaXNJblBsdWdpbnM6IHRydWUgfSkuZWwoKTtcbn1cblxuZnVuY3Rpb24gZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm4ocGxheWVyKSB7XG4gICAgcmV0dXJuIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUuaGFuZGxlQ2xpY2tcbn1cblxudmFyIGNvbXBvbmVudCA9IHZpZGVvanMuZ2V0Q29tcG9uZW50KCdDb21wb25lbnQnKTtcblxudmFyIG5vdGljZSA9IE5vdGljZShjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnTm90aWNlJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBub3RpY2UpKTtcblxudmFyIGhlbHBlckNhbnZhcyA9IEhlbHBlckNhbnZhcyhjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnSGVscGVyQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBoZWxwZXJDYW52YXMpKTtcblxudmFyIGJ1dHRvbiA9IHZpZGVvanMuZ2V0Q29tcG9uZW50KFwiQnV0dG9uXCIpO1xudmFyIHZyQnRuID0gVlJCdXR0b24oYnV0dG9uKTtcbnZpZGVvanMucmVnaXN0ZXJDb21wb25lbnQoJ1ZSQnV0dG9uJywgdmlkZW9qcy5leHRlbmQoYnV0dG9uLCB2ckJ0bikpO1xuXG52YXIgY2FyZGJvYXJkTWVzc2FnZSA9IENhcmRib2FyZE1lc3NhZ2UoY29tcG9uZW50KTtcbnZpZGVvanMucmVnaXN0ZXJDb21wb25lbnQoJ0NhcmRib2FyZE1lc3NhZ2UnLCB2aWRlb2pzLmV4dGVuZChjb21wb25lbnQsIGNhcmRib2FyZE1lc3NhZ2UpKTtcblxudmFyIG9yaWVudGF0aW9uSWNvbiA9IE9yaWVudGF0aW9uSWNvbihjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnT3JpZW50YXRpb25JY29uJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBvcmllbnRhdGlvbkljb24pKTtcblxuLy8gUmVnaXN0ZXIgdGhlIHBsdWdpbiB3aXRoIHZpZGVvLmpzLlxudmlkZW9qcy5wbHVnaW4oJ3Bhbm9yYW1hJywgcGFub3JhbWEoe1xuICAgIF9pbml0OiBmdW5jdGlvbihvcHRpb25zKXtcbiAgICAgICAgdmFyIGNhbnZhcyA9IChvcHRpb25zLnZpZGVvVHlwZSAhPT0gXCIzZFZpZGVvXCIpP1xuICAgICAgICAgICAgQ2FudmFzKGNvbXBvbmVudCwgd2luZG93LlRIUkVFLCB7XG4gICAgICAgICAgICAgICAgZ2V0VGVjaDogZ2V0VGVjaFxuICAgICAgICAgICAgfSkgOlxuICAgICAgICAgICAgVGhyZWVEQ2FudmFzKGNvbXBvbmVudCwgd2luZG93LlRIUkVFLCB7XG4gICAgICAgICAgICAgICAgZ2V0VGVjaDogZ2V0VGVjaFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIHZpZGVvanMucmVnaXN0ZXJDb21wb25lbnQoJ0NhbnZhcycsIHZpZGVvanMuZXh0ZW5kKGNvbXBvbmVudCwgY2FudmFzKSk7XG4gICAgfSxcbiAgICBtZXJnZU9wdGlvbjogZnVuY3Rpb24gKGRlZmF1bHRzLCBvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiB2aWRlb2pzLm1lcmdlT3B0aW9ucyhkZWZhdWx0cywgb3B0aW9ucyk7XG4gICAgfSxcbiAgICBnZXRUZWNoOiBnZXRUZWNoLFxuICAgIGdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuOiBnZXRGdWxsc2NyZWVuVG9nZ2xlQ2xpY2tGblxufSkpO1xuIl19
