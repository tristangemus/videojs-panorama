/**
 * Created by tristan gemus on 06/17/2017
 */

var CardboardMessage = function(baseComponent){
    var element = document.createElement('div');
    element.className = "vjs-video-notice-cardboard";

    function isPortrait() {
        return (typeof event.portrait !== "undefined")? event.portrait : window.matchMedia("(orientation: portrait)").matches;
    }

    return {
        active: false,

        constructor: function init(player, options){
            baseComponent.call(this, player, options);
        },

        maybeDisplay: function(canvas, event) {
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

        el: function () {
            return element;
        }
    }
};

export default CardboardMessage;