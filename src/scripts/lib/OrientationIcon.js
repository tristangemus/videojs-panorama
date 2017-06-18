/**
 * Created by tristan gemus on 06/17/2017
 */

var OrientationIcon = function(baseComponent){
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

        constructor: function init(player, options){
            baseComponent.call(this, player, options);
        },

        mouseHandler: function(canvas, e) {
            switch(e.type) {
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

        initEvents: function(canvas) {
            window.addEventListener('devicemotion', this.update.bind(this, canvas));

            var mouseEvents = ['mousedown', 'mouseup', 'mousemove'];

            for (var key in mouseEvents) {
                window.addEventListener(mouseEvents[key], this.mouseHandler.bind(this, canvas));
            }
        },

        update: function (canvas, object) {
            var degrees = getOrientationDegrees(canvas) + 90;
            this.el().style.transform = 'rotate(' + degrees + 'deg)';
        },

        el: function () {
            return element;
        }
    }
};

export default OrientationIcon;