var DragDropTouch;
(function (DragDropTouch_1) {
    'use strict';
    /**
     * Object used to hold the data that is being dragged during drag and drop operations.
     *
     * It may hold one or more data items of different types. For more information about
     * drag and drop operations and data transfer objects, see
     * <a href="https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer">MDN's DataTransfer object documentation</a>.
     */
    var DataTransfer = (function () {
        function DataTransfer() {
            this._dropEffect = 'move';
            this._effectAllowed = 'all';
            this._data = {};
        }
        Object.defineProperty(DataTransfer.prototype, "dropEffect", {
            /**
             * Gets or sets the type of drag-and-drop operation currently selected.
             * The value must be 'none', 'copy', 'link', or 'move'.
             */
            get: function () {
                return this._dropEffect;
            },
            set: function (value) {
                this._dropEffect = value;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DataTransfer.prototype, "effectAllowed", {
            /**
             * Gets or sets the types of operations that are possible.
             * Must be one of 'none', 'copy', 'copyLink', 'copyMove', 'link',
             * 'linkMove', 'move', 'all' or 'uninitialized'.
             */
            get: function () {
                return this._effectAllowed;
            },
            set: function (value) {
                this._effectAllowed = value;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DataTransfer.prototype, "types", {
            /**
             * Gets an array of strings giving the formats that were set in the @see:setData method.
             */
            get: function () {
                return Object.keys(this._data);
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Removes the data associated with a given type.
         *
         * The type argument is optional. If the type is empty or not specified, the data
         * associated with all types is removed. If data for the specified type does not exist,
         * or the data transfer contains no data, this method will have no effect.
         *
         * @param type Type of data to remove.
         */
        DataTransfer.prototype.clearData = function (type) {
            if (type !== null && type !== undefined) {
                delete this._data[type.toLowerCase()];
            }
            else {
                this._data = {};
            }
        };
        /**
         * Retrieves the data for a given type, or an empty string if data for that type does
         * not exist or the data transfer contains no data.
         *
         * @param type Type of data to retrieve.
         */
        DataTransfer.prototype.getData = function (type) {
            var lcType = type.toLowerCase();
            return this._data[lcType] || '';
        };
        /**
         * Set the data for a given type.
         *
         * For a list of recommended drag types, see
         * <a href="https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Recommended_Drag_Types">Recommended Drag Types</a>.
         *
         * @param type Type of data to add.
         * @param value Data to add.
         */
        DataTransfer.prototype.setData = function (type, value) {
            this._data[type.toLowerCase()] = value;
        };
        /**
         * Set the image to be used for dragging if a custom one is desired.
         *
         * @param img An image element to use as the drag feedback image.
         * @param offsetX The horizontal offset within the image.
         * @param offsetY The vertical offset within the image.
         */
        DataTransfer.prototype.setDragImage = function (img, offsetX, offsetY) {
            var ddt = DragDropTouch._instance;
            ddt._imgCustom = img;
            ddt._imgOffset = { x: offsetX, y: offsetY };
        };
        return DataTransfer;
    }());
    DragDropTouch_1.DataTransfer = DataTransfer;
    /**
     * Defines a class that adds focal-to-drag and drop support strictly for desktop browsers.
     *
     * The @see:DragDropTouch class listens to touch events and raises the appropriate
     * HTML5 drag-and-drop events as the user moves the finger on the screen.
     */
    var DragDropTouch = (function () {
        /**
         * Initializes the single instance of the @see:DragDropTouch class.
         */
        function DragDropTouch() {
            this._lastClick = 0;
            // enforce singleton pattern
            if (DragDropTouch._instance) {
                throw 'DragDropTouch instance already created.';
            }
            // detect iPad, iPhone, Android
            var p = navigator.platform, u = navigator.userAgent;
            var isIOS = /iPad|iPhone|iPod/.test(p) || (p === 'MacIntel' && navigator.maxTouchPoints > 1);
            var isAndroid = u.indexOf('Android') > -1;
            if (isIOS || isAndroid || ('ontouchstart' in window)) {
                var doc = document;
                doc.addEventListener('touchstart', this._touchstart.bind(this), { passive: false });
                doc.addEventListener('touchmove', this._touchmove.bind(this), { passive: false });
                doc.addEventListener('touchend', this._touchend.bind(this));
                doc.addEventListener('touchcancel', this._touchend.bind(this));
            }
        }
        /**
         * Gets a reference to the single instance of the @see:DragDropTouch class.
         */
        DragDropTouch.getInstance = function () {
            return DragDropTouch._instance;
        };
        // ** event handlers
        DragDropTouch.prototype._touchstart = function (e) {
            var _this = this;
            if (this._shouldHandle(e)) {
                // raise double-click and prevent zooming
                if (Date.now() - this._lastClick < DragDropTouch._DBLCLICK) {
                    if (this._dispatchEvent(e, 'dblclick', e.target)) {
                        e.preventDefault();
                        this._reset();
                        return;
                    }
                }
                // clear all variables
                this._reset();
                // get nearest draggable element
                var src = this._closestDraggable(e.target);
                if (src) {
                    // give items a chance to handle the touchstart themselves
                    if (!this._dispatchEvent(e, 'touchstart', src) && !this._dispatchEvent(e, 'mousedown', src)) {
                        // start drag operation after a delay
                        this._dragSource = src;
                        this._ptStart = this._getPoint(e);
                        this._lastTouch = e;
                        e.preventDefault();
                        // raise dragstart after a delay
                        setTimeout(function () {
                            if (_this._dragSource === src && _this._img === null) {
                                if (_this._dispatchEvent(e, 'contextmenu', src)) {
                                    _this._reset();
                                }
                            }
                        }, DragDropTouch._CTXMENU);
                        if (DragDropTouch._ISPRESSHOLDMODE) {
                            this._pressHoldInterval = setTimeout(function () {
                                _this._isPressHoldMode = true;
                                _this._touchmove(e);
                            }, DragDropTouch._PRESSHOLDMARGIN);
                        }
                    }
                }
            }
        };
        DragDropTouch.prototype._touchmove = function (e) {
            if (this._shouldHandle(e)) {
                // see if we are dragging
                var s = this._closestDraggable(e.target);
                if (this._isDragInProgress()) {
                    this._lastTouch = e;
                    this._dispatchEvent(e, 'dragover', this._getTarget(e));
                    this._moveImage(e);
                    e.preventDefault();
                }
                else if (this._isSignificantMove(e)) {
                    // check if we should start dragging
                    if (this._dragSource && !this._img) {
                        this._dispatchEvent(e, 'dragstart', this._dragSource);
                        this._createImage(e);
                        this._dispatchEvent(e, 'dragenter', this._getTarget(e));
                    }
                }
            }
        };
        DragDropTouch.prototype._touchend = function (e) {
            if (this._shouldHandle(e)) {
                if (this._isDragInProgress()) {
                    this._dispatchEvent(this._lastTouch, 'drop', this._getTarget(this._lastTouch));
                    this._dispatchEvent(this._lastTouch, 'dragend', this._dragSource);
                    this._reset();
                    e.preventDefault();
                }
                else if (this._dragSource) {
                    this._dispatchEvent(this._lastTouch, 'click', this._dragSource);
                    this._reset();
                }
            }
        };
        // ** utility methods
        DragDropTouch.prototype._shouldHandle = function (e) {
            return e && !e.defaultPrevented && e.touches && e.touches.length < 2;
        };
        DragDropTouch.prototype._reset = function () {
            this._destroyImage();
            this._dragSource = null;
            this._lastTouch = null;
            this._isPressHoldMode = false;
            if (this._pressHoldInterval) {
                clearTimeout(this._pressHoldInterval);
                this._pressHoldInterval = null;
            }
        };
        DragDropTouch.prototype._getPoint = function (e, page) {
            if (e && e.touches && e.touches.length > 0) {
                var t = e.touches[0];
                return { x: page ? t.pageX : t.clientX, y: page ? t.pageY : t.clientY };
            }
            return { x: 0, y: 0 };
        };
        DragDropTouch.prototype._getDelta = function (e) {
            var p = this._getPoint(e);
            return Math.abs(p.x - this._ptStart.x) + Math.abs(p.y - this._ptStart.y);
        };
        DragDropTouch.prototype._getTarget = function (e) {
            var pt = this._getPoint(e);
            var el = document.elementFromPoint(pt.x, pt.y);
            while (el && getComputedStyle(el).pointerEvents === 'none') {
                el = el.parentElement;
            }
            return el;
        };
        DragDropTouch.prototype._createImage = function (e) {
            if (this._img) {
                this._destroyImage();
            }
            var src = this._imgCustom || this._dragSource;
            this._img = src.cloneNode(true);
            this._copyStyle(src, this._img);
            this._img.style.top = this._img.style.left = '-9999px';
            if (!this._imgCustom) {
                var rc = src.getBoundingClientRect(), pt = this._getPoint(e);
                this._imgOffset = { x: pt.x - rc.left, y: pt.y - rc.top };
                this._img.style.opacity = DragDropTouch._OPACITY.toString();
            }
            this._moveImage(e);
            document.body.appendChild(this._img);
        };
        DragDropTouch.prototype._destroyImage = function () {
            if (this._img && this._img.parentElement) {
                this._img.parentElement.removeChild(this._img);
            }
            this._img = null;
            this._imgCustom = null;
        };
        DragDropTouch.prototype._moveImage = function (e) {
            var _this = this;
            requestAnimationFrame(function () {
                if (_this._img) {
                    var pt = _this._getPoint(e, true);
                    var s = _this._img.style;
                    s.position = 'absolute';
                    s.pointerEvents = 'none';
                    s.zIndex = '999999';
                    s.left = Math.round(pt.x - _this._imgOffset.x) + 'px';
                    s.top = Math.round(pt.y - _this._imgOffset.y) + 'px';
                }
            });
        };
        DragDropTouch.prototype._copyStyle = function (src, dst) {
            DragDropTouch._kbdProps.forEach(function (p) {
                dst.style[p] = src.style[p];
            });
            if (src instanceof HTMLCanvasElement) {
                var cSrc = src, cDst = dst;
                cDst.width = cSrc.width;
                cDst.height = cSrc.height;
                cDst.getContext('2d').drawImage(cSrc, 0, 0);
            }
            var cs = getComputedStyle(src);
            for (var i = 0; i < cs.length; i++) {
                var key = cs[i];
                if (key.indexOf('transition') < 0) {
                    dst.style[key] = cs[key];
                }
            }
            dst.style.pointerEvents = 'none';
            for (var i = 0; i < src.children.length; i++) {
                this._copyStyle(src.children[i], dst.children[i]);
            }
        };
        DragDropTouch.prototype._dispatchEvent = function (e, type, target) {
            if (e && target) {
                var evt = document.createEvent('Event'), t = e.touches ? e.touches[0] : e;
                evt.initEvent(type, true, true);
                evt.button = 0;
                evt.which = 1;
                evt.buttons = 1;
                evt.altKey = e.altKey;
                evt.ctrlKey = e.ctrlKey;
                evt.metaKey = e.metaKey;
                evt.shiftKey = e.shiftKey;
                evt.clientX = t.clientX;
                evt.clientY = t.clientY;
                evt.pageX = t.pageX;
                evt.pageY = t.pageY;
                evt.screenX = t.screenX;
                evt.screenY = t.screenY;
                evt.dataTransfer = this._dataTransfer;
                target.dispatchEvent(evt);
                return evt.defaultPrevented;
            }
            return false;
        };
        DragDropTouch.prototype._closestDraggable = function (el) {
            for (; el; el = el.parentElement) {
                if (el.hasAttribute('draggable') && el.draggable) {
                    return el;
                }
            }
            return null;
        };
        DragDropTouch.prototype._isDragInProgress = function () {
            return this._img !== null;
        };
        DragDropTouch.prototype._isSignificantMove = function (e) {
            return this._getDelta(e) > DragDropTouch._THRESHOLD;
        };
        // ** constants
        DragDropTouch._THRESHOLD = 5; // pixels to move before drag starts
        DragDropTouch._CTXMENU = 900; // msec to wait before raising context menu
        DragDropTouch._OPACITY = 0.5; // opacity of drag image
        DragDropTouch._DBLCLICK = 500; // max msec for double-click
        DragDropTouch._ISPRESSHOLDMODE = false; // press-and-hold to drag
        DragDropTouch._PRESSHOLDMARGIN = 400; // msec for press-and-hold
        DragDropTouch._kbdProps = ['username', 'password', 'autofill', 'lastClick'];
        DragDropTouch._instance = new DragDropTouch();
        return DragDropTouch;
    }());
    DragDropTouch_1.DragDropTouch = DragDropTouch;
})(DragDropTouch || (DragDropTouch = {}));
