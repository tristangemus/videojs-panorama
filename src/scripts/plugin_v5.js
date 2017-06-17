'use strict';

import Canvas  from './lib/Canvas';
import ThreeDCanvas from './lib/ThreeCanvas';
import Notice  from './lib/Notice';
import HelperCanvas from './lib/HelperCanvas';
import VRButton from './lib/VRButton';
import CardboardMessage from './lib/CardboardMessage';
import OrientationIcon from './lib/OrientationIcon';
import panorama from './plugin';

function getTech(player) {
    return player.tech({ IWillNotUseThisInPlugins: true }).el();
}

function getFullscreenToggleClickFn(player) {
    return player.controlBar.fullscreenToggle.handleClick
}

var component = videojs.getComponent('Component');

var notice = Notice(component);
videojs.registerComponent('Notice', videojs.extend(component, notice));

var helperCanvas = HelperCanvas(component);
videojs.registerComponent('HelperCanvas', videojs.extend(component, helperCanvas));

var button = videojs.getComponent("Button");
var vrBtn = VRButton(button);
videojs.registerComponent('VRButton', videojs.extend(button, vrBtn));

var cardboardMessage = CardboardMessage(component);
videojs.registerComponent('CardboardMessage', videojs.extend(component, cardboardMessage));

var orientationIcon = OrientationIcon(component);
videojs.registerComponent('OrientationIcon', videojs.extend(component, orientationIcon));

// Register the plugin with video.js.
videojs.plugin('panorama', panorama({
    _init: function(options){
        var canvas = (options.videoType !== "3dVideo")?
            Canvas(component, window.THREE, {
                getTech: getTech
            }) :
            ThreeDCanvas(component, window.THREE, {
                getTech: getTech
            });
        videojs.registerComponent('Canvas', videojs.extend(component, canvas));
    },
    mergeOption: function (defaults, options) {
        return videojs.mergeOptions(defaults, options);
    },
    getTech: getTech,
    getFullscreenToggleClickFn: getFullscreenToggleClickFn
}));
