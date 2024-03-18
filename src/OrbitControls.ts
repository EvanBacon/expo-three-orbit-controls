/**
 * A custom TypeScript port of OrbitControls with exposed touch methods for native overrides.
 *
 * @author EvanBacon / https://github.com/evanbacon
 * @author qiao / https://github.com/qiao
 * @author mrdoob / http://mrdoob.com
 * @author alteredq / http://alteredqualia.com/
 * @author WestLangley / http://github.com/WestLangley
 * @author erich666 / http://erichaines.com
 * @author ScieCode / http://github.com/sciecode
 */

import {
  EventDispatcher,
  MOUSE,
  Quaternion,
  Matrix4,
  Spherical,
  TOUCH,
  Vector2,
  Vector3,
  Camera,
} from 'three';
import { Platform } from 'react-native';
import { getNode } from 'react-native-web-hooks';
// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move

const STATE = {
  NONE: -1,
  ROTATE: 0,
  DOLLY: 1,
  PAN: 2,
  TOUCH_ROTATE: 3,
  TOUCH_PAN: 4,
  TOUCH_DOLLY_PAN: 5,
  TOUCH_DOLLY_ROTATE: 6,
};
const EPS = 0.000001;

const useDOM = false;

export class OrbitControls extends EventDispatcher {
  // Set to false to disable this control
  enabled: boolean = true;

  // "target" sets the location of focus, where the object orbits around
  target: Vector3 = new Vector3();

  // How far you can dolly in and out ( PerspectiveCamera only )
  minDistance: number = 0;
  maxDistance: number = Infinity;

  // How far you can zoom in and out ( OrthographicCamera only )
  minZoom: number = 0;
  maxZoom: number = Infinity;

  // How far you can orbit vertically, upper and lower limits.
  // Range is 0 to Math.PI radians.
  minPolarAngle: number = 0; // radians
  maxPolarAngle: number = Math.PI; // radians

  // How far you can orbit horizontally, upper and lower limits.
  // If set, must be a sub-interval of the interval [ - Math.PI, Math.PI ].
  minAzimuthAngle: number = -Infinity; // radians
  maxAzimuthAngle: number = Infinity; // radians

  // Set to true to enable damping (inertia)
  // If damping is enabled, you must call controls.update() in your animation loop
  enableDamping = false;
  dampingFactor = 0.05;

  // This option actually enables dollying in and out; left as "zoom" for backwards compatibility.
  // Set to false to disable zooming
  enableZoom = true;
  zoomSpeed = 1.0;

  // Set to false to disable rotating
  enableRotate = true;
  rotateSpeed = 1.0;

  // Set to false to disable panning
  enablePan = true;
  panSpeed = 1.0;
  screenSpacePanning = false; // if true, pan in screen-space
  keyPanSpeed = 7.0; // pixels moved per arrow key push

  // Set to true to automatically rotate around the target
  // If auto-rotate is enabled, you must call controls.update() in your animation loop
  autoRotate = false;
  autoRotateSpeed = 2.0; // 30 seconds per round when fps is 60

  // Set to false to disable use of the keys
  enableKeys = true;

  // The four arrow keys
  keys = { LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40 };

  // Mouse buttons
  mouseButtons = {
    LEFT: MOUSE.ROTATE,
    MIDDLE: MOUSE.DOLLY,
    RIGHT: MOUSE.PAN,
  };

  // Touch fingers
  touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

  // for reset
  target0: Vector3;
  position0: Vector3;
  zoom0: number;

  // this method is exposed, but perhaps it would be better if we can make it private...
  public update: () => boolean;

  // PRIVATE

  //
  // internals
  //

  private changeEvent = { type: 'change' };
  private startEvent = { type: 'start' };
  private endEvent = { type: 'end' };

  private state = STATE.NONE;

  // current position in spherical coordinates
  private spherical = new Spherical();
  private sphericalDelta = new Spherical();

  private scale = 1;
  private panOffset = new Vector3();
  private zoomChanged = false;

  private rotateStart = new Vector2();
  private rotateEnd = new Vector2();
  private rotateDelta = new Vector2();

  private panStart = new Vector2();
  private panEnd = new Vector2();
  private panDelta = new Vector2();

  private dollyStart = new Vector2();
  private dollyEnd = new Vector2();
  private dollyDelta = new Vector2();

  private panLeft: (distance: number, objectMatrix: Matrix4) => void;
  private panUp: (distance: number, objectMatrix: Matrix4) => void;
  private pan: (deltaX: number, deltaY: number) => void;

  public domElement?: any;

  constructor(
    public object: Camera & {
      // Add missing camera types
      fov: number;
      top: number;
      right: number;
      left: number;
      bottom: number;
      zoom: number;
      updateProjectionMatrix: () => void;
      isOrthographicCamera?: boolean;
      isPerspectiveCamera?: boolean;
    },
    ref?: any
  ) {
    super();

    if (ref && Platform.OS === 'web' && typeof window !== 'undefined') {
      this.domElement = getNode(ref) || window.document;
    }

    // for reset
    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.zoom0 = this.object.zoom;

    //

    if (this.domElement) {
      this.domElement.addEventListener(
        'contextmenu',
        this.onContextMenu,
        false
      );

      this.domElement.addEventListener('mousedown', this.onMouseDown, false);
      this.domElement.addEventListener('wheel', this.onMouseWheel, false);

      if (useDOM) {
        this.domElement.addEventListener(
          'touchstart',
          this.onTouchStart,
          false
        );
        this.domElement.addEventListener('touchend', this.onTouchEnd, false);
        this.domElement.addEventListener('touchmove', this.onTouchMove, false);
      }

      window.addEventListener('keydown', this.onKeyDown, false);
    }

    // force an update at start

    this.update = (() => {
      const offset = new Vector3();

      // so camera.up is the orbit axis
      const quat = new Quaternion().setFromUnitVectors(
        this.object.up,
        new Vector3(0, 1, 0)
      );
      const quatInverse = quat.clone().inverse();

      const lastPosition = new Vector3();
      const lastQuaternion = new Quaternion();

      return (): boolean => {
        const position = this.object.position;

        offset.copy(position).sub(this.target);

        // rotate offset to "y-axis-is-up" space
        offset.applyQuaternion(quat);

        // angle from z-axis around y-axis
        this.spherical.setFromVector3(offset);

        if (this.autoRotate && this.state === STATE.NONE) {
          this.rotateLeft(this.getAutoRotationAngle());
        }

        if (this.enableDamping) {
          this.spherical.theta +=
            this.sphericalDelta.theta * this.dampingFactor;
          this.spherical.phi += this.sphericalDelta.phi * this.dampingFactor;
        } else {
          this.spherical.theta += this.sphericalDelta.theta;
          this.spherical.phi += this.sphericalDelta.phi;
        }

        // restrict theta to be between desired limits
        this.spherical.theta = Math.max(
          this.minAzimuthAngle,
          Math.min(this.maxAzimuthAngle, this.spherical.theta)
        );

        // restrict phi to be between desired limits
        this.spherical.phi = Math.max(
          this.minPolarAngle,
          Math.min(this.maxPolarAngle, this.spherical.phi)
        );

        this.spherical.makeSafe();

        this.spherical.radius *= this.scale;

        // restrict radius to be between desired limits
        this.spherical.radius = Math.max(
          this.minDistance,
          Math.min(this.maxDistance, this.spherical.radius)
        );

        // move target to panned location

        if (this.enableDamping === true) {
          this.target.addScaledVector(this.panOffset, this.dampingFactor);
        } else {
          this.target.add(this.panOffset);
        }

        offset.setFromSpherical(this.spherical);

        // rotate offset back to "camera-up-vector-is-up" space
        offset.applyQuaternion(quatInverse);

        position.copy(this.target).add(offset);

        this.object.lookAt(this.target);

        if (this.enableDamping === true) {
          this.sphericalDelta.theta *= 1 - this.dampingFactor;
          this.sphericalDelta.phi *= 1 - this.dampingFactor;

          this.panOffset.multiplyScalar(1 - this.dampingFactor);
        } else {
          this.sphericalDelta.set(0, 0, 0);

          this.panOffset.set(0, 0, 0);
        }

        this.scale = 1;

        // update condition is:
        // min(camera displacement, camera rotation in radians)^2 > this.EPS
        // using small-angle approximation cos(x/2) = 1 - x^2 / 8

        if (
          this.zoomChanged ||
          lastPosition.distanceToSquared(this.object.position) > EPS ||
          8 * (1 - lastQuaternion.dot(this.object.quaternion)) > EPS
        ) {
          this.dispatchEvent(this.changeEvent);

          lastPosition.copy(this.object.position);
          lastQuaternion.copy(this.object.quaternion);
          this.zoomChanged = false;

          return true;
        }

        return false;
      };
    })();

    this.panLeft = (() => {
      const v = new Vector3();

      return (distance: number, objectMatrix: Matrix4) => {
        v.setFromMatrixColumn(objectMatrix, 0); // get X column of objectMatrix
        v.multiplyScalar(-distance);

        this.panOffset.add(v);
      };
    })();

    this.panUp = (() => {
      const v = new Vector3();

      return (distance: number, objectMatrix: Matrix4) => {
        if (this.screenSpacePanning === true) {
          v.setFromMatrixColumn(objectMatrix, 1);
        } else {
          v.setFromMatrixColumn(objectMatrix, 0);
          v.crossVectors(this.object.up, v);
        }

        v.multiplyScalar(distance);

        this.panOffset.add(v);
      };
    })();

    // deltaX and deltaY are in pixels; right and down are positive
    this.pan = (() => {
      const offset = new Vector3();

      return (deltaX: number, deltaY: number) => {
        const element =
          this.domElement === window.document
            ? this.domElement.body
            : this.domElement;

        if (this.object.isPerspectiveCamera) {
          // perspective
          const position = this.object.position;
          offset.copy(position).sub(this.target);
          let targetDistance = offset.length();

          // half of the fov is center to top of screen
          targetDistance *= Math.tan(((this.object.fov / 2) * Math.PI) / 180.0);

          // we use only clientHeight here so aspect ratio does not distort speed
          this.panLeft(
            (2 * deltaX * targetDistance) / this.getElementHeight(),
            this.object.matrix
          );
          this.panUp(
            (2 * deltaY * targetDistance) / this.getElementHeight(),
            this.object.matrix
          );
        } else if (this.object.isOrthographicCamera) {
          // orthographic
          this.panLeft(
            (deltaX * (this.object.right - this.object.left)) /
              this.object.zoom /
              this.getElementWidth(),
            this.object.matrix
          );
          this.panUp(
            (deltaY * (this.object.top - this.object.bottom)) /
              this.object.zoom /
              this.getElementHeight(),
            this.object.matrix
          );
        } else {
          // camera neither orthographic nor perspective
          console.warn(
            'WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.'
          );
          this.enablePan = false;
        }
      };
    })();

    this.update();
  }

  getPolarAngle = () => this.spherical.phi;

  getAzimuthalAngle = () => this.spherical.theta;

  saveState = () => {
    this.target0.copy(this.target);
    this.position0.copy(this.object.position);
    this.zoom0 = this.object.zoom;
  };

  reset = () => {
    this.target.copy(this.target0);
    this.object.position.copy(this.position0);
    this.object.zoom = this.zoom0;

    this.object.updateProjectionMatrix();
    this.dispatchEvent(this.changeEvent);

    this.update();

    this.state = STATE.NONE;
  };

  dispose = () => {
    if (this.domElement) {
      this.domElement.removeEventListener(
        'contextmenu',
        this.onContextMenu,
        false
      );
      this.domElement.removeEventListener('mousedown', this.onMouseDown, false);
      this.domElement.removeEventListener('wheel', this.onMouseWheel, false);

      if (useDOM) {
        this.domElement.removeEventListener(
          'touchstart',
          this.onTouchStart,
          false
        );
        this.domElement.removeEventListener('touchend', this.onTouchEnd, false);
        this.domElement.removeEventListener(
          'touchmove',
          this.onTouchMove,
          false
        );
        // Skip Node.js envs
        if (typeof window !== 'undefined') {
          window.document.removeEventListener(
            'mousemove',
            this.onMouseMove,
            false
          );
          window.document.removeEventListener('mouseup', this.onMouseUp, false);
          window.removeEventListener('keydown', this.onKeyDown, false);
        }
      }
    }

    //this.dispatchEvent( { type: 'dispose' } ); // should this be added here?
  };

  // Private methods

  private getAutoRotationAngle = (): number => {
    return ((2 * Math.PI) / 60 / 60) * this.autoRotateSpeed;
  };

  private getZoomScale = (): number => {
    return 0.95 ** this.zoomSpeed;
  };

  private rotateLeft = (angle: number) => {
    this.sphericalDelta.theta -= angle;
  };

  private rotateUp = (angle: number) => {
    this.sphericalDelta.phi -= angle;
  };

  private dollyIn = (dollyScale: number) => {
    if (this.object.isPerspectiveCamera) {
      this.scale /= dollyScale;
    } else if (this.object.isOrthographicCamera) {
      this.object.zoom = Math.max(
        this.minZoom,
        Math.min(this.maxZoom, this.object.zoom * dollyScale)
      );
      this.object.updateProjectionMatrix();
      this.zoomChanged = true;
    } else {
      console.warn(
        'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.'
      );
      this.enableZoom = false;
    }
  };

  private dollyOut = (dollyScale: number) => {
    if (this.object.isPerspectiveCamera) {
      this.scale *= dollyScale;
    } else if (this.object.isOrthographicCamera) {
      this.object.zoom = Math.max(
        this.minZoom,
        Math.min(this.maxZoom, this.object.zoom / dollyScale)
      );
      this.object.updateProjectionMatrix();
      this.zoomChanged = true;
    } else {
      console.warn(
        'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.'
      );
      this.enableZoom = false;
    }
  };

  //
  // event callbacks - update the object state
  //

  width: number = 0;

  getElementWidth = (): number => {
    return this.width;
  };

  height: number = 0;

  getElementHeight = (): number => {
    return this.height;
  };

  private handleMouseDownRotate = ({ clientX, clientY }) => {
    this.rotateStart.set(clientX, clientY);
  };

  private handleMouseDownDolly = ({ clientX, clientY }) => {
    this.dollyStart.set(clientX, clientY);
  };

  private handleMouseDownPan = ({ clientX, clientY }) => {
    this.panStart.set(clientX, clientY);
  };

  private handleMouseMoveRotate = ({ clientX, clientY }) => {
    this.rotateEnd.set(clientX, clientY);

    this.rotateDelta
      .subVectors(this.rotateEnd, this.rotateStart)
      .multiplyScalar(this.rotateSpeed);

    // const element =
    //   this.domElement === document ? this.domElement.body : this.domElement;

    this.rotateLeft(
      (2 * Math.PI * this.rotateDelta.x) / this.getElementHeight()
    ); // yes, height

    this.rotateUp((2 * Math.PI * this.rotateDelta.y) / this.getElementHeight());

    this.rotateStart.copy(this.rotateEnd);

    this.update();
  };

  private handleMouseMoveDolly = ({ clientX, clientY }) => {
    this.dollyEnd.set(clientX, clientY);

    this.dollyDelta.subVectors(this.dollyEnd, this.dollyStart);

    if (this.dollyDelta.y > 0) {
      this.dollyIn(this.getZoomScale());
    } else if (this.dollyDelta.y < 0) {
      this.dollyOut(this.getZoomScale());
    }

    this.dollyStart.copy(this.dollyEnd);

    this.update();
  };

  private handleMouseMovePan = ({ clientX, clientY }) => {
    this.panEnd.set(clientX, clientY);

    this.panDelta
      .subVectors(this.panEnd, this.panStart)
      .multiplyScalar(this.panSpeed);

    this.pan(this.panDelta.x, this.panDelta.y);

    this.panStart.copy(this.panEnd);

    this.update();
  };

  private handleMouseUp(/*event*/) {
    // no-op
  }

  private handleMouseWheel = ({ deltaY }) => {
    if (deltaY < 0) {
      this.dollyOut(this.getZoomScale());
    } else if (deltaY > 0) {
      this.dollyIn(this.getZoomScale());
    }

    this.update();
  };

  private handleKeyDown = event => {
    let needsUpdate = false;

    switch (event.keyCode) {
      case this.keys.UP:
        this.pan(0, this.keyPanSpeed);
        needsUpdate = true;
        break;

      case this.keys.BOTTOM:
        this.pan(0, -this.keyPanSpeed);
        needsUpdate = true;
        break;

      case this.keys.LEFT:
        this.pan(this.keyPanSpeed, 0);
        needsUpdate = true;
        break;

      case this.keys.RIGHT:
        this.pan(-this.keyPanSpeed, 0);
        needsUpdate = true;
        break;
    }

    if (needsUpdate) {
      // prevent the browser from scrolling on cursor keys
      event.preventDefault?.();

      this.update();
    }
  };

  private handleTouchStartRotate = ({ touches }) => {
    if (touches.length == 1) {
      this.rotateStart.set(touches[0].pageX, touches[0].pageY);
    } else {
      const x = 0.5 * (touches[0].pageX + touches[1].pageX);
      const y = 0.5 * (touches[0].pageY + touches[1].pageY);

      this.rotateStart.set(x, y);
    }
  };

  private handleTouchStartPan = ({ touches }) => {
    if (touches.length === 1) {
      this.panStart.set(touches[0].pageX, touches[0].pageY);
    } else {
      const x = 0.5 * (touches[0].pageX + touches[1].pageX);
      const y = 0.5 * (touches[0].pageY + touches[1].pageY);

      this.panStart.set(x, y);
    }
  };

  private handleTouchStartDolly = ({ touches }) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    this.dollyStart.set(0, distance);
  };

  private handleTouchStartDollyPan = event => {
    if (this.enableZoom) this.handleTouchStartDolly(event);

    if (this.enablePan) this.handleTouchStartPan(event);
  };

  private handleTouchStartDollyRotate = event => {
    if (this.enableZoom) this.handleTouchStartDolly(event);

    if (this.enableRotate) this.handleTouchStartRotate(event);
  };

  private handleTouchMoveRotate = ({ touches }) => {
    if (touches.length === 1) {
      this.rotateEnd.set(touches[0].pageX, touches[0].pageY);
    } else {
      const x = 0.5 * (touches[0].pageX + touches[1].pageX);
      const y = 0.5 * (touches[0].pageY + touches[1].pageY);

      this.rotateEnd.set(x, y);
    }

    this.rotateDelta
      .subVectors(this.rotateEnd, this.rotateStart)
      .multiplyScalar(this.rotateSpeed);

    this.rotateLeft(
      (2 * Math.PI * this.rotateDelta.x) / this.getElementHeight()
    ); // yes, height

    this.rotateUp((2 * Math.PI * this.rotateDelta.y) / this.getElementHeight());

    this.rotateStart.copy(this.rotateEnd);
  };

  private handleTouchMovePan = ({ touches }) => {
    if (touches.length == 1) {
      this.panEnd.set(touches[0].pageX, touches[0].pageY);
    } else {
      const x = 0.5 * (touches[0].pageX + touches[1].pageX);
      const y = 0.5 * (touches[0].pageY + touches[1].pageY);

      this.panEnd.set(x, y);
    }

    this.panDelta
      .subVectors(this.panEnd, this.panStart)
      .multiplyScalar(this.panSpeed);

    this.pan(this.panDelta.x, this.panDelta.y);

    this.panStart.copy(this.panEnd);
  };

  private handleTouchMoveDolly = ({ touches }) => {
    if (!Array.isArray(touches)) touches = [];
    if (!touches[0]) touches[0] = { pageX: 0, pageY: 0 };
    if (!touches[1])
      touches[1] = {
        pageX: touches[0].pageX || 0,
        pageY: touches[0].pageY || 0,
      };
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    this.dollyEnd.set(0, distance);

    this.dollyDelta.set(
      0,
      this.dollyEnd.y / this.dollyStart.y ** this.zoomSpeed
    );

    this.dollyIn(this.dollyDelta.y);

    this.dollyStart.copy(this.dollyEnd);
  };

  private handleTouchMoveDollyPan = event => {
    if (this.enableZoom) this.handleTouchMoveDolly(event);

    if (this.enablePan) this.handleTouchMovePan(event);
  };

  private handleTouchMoveDollyRotate = event => {
    if (this.enableZoom) this.handleTouchMoveDolly(event);

    if (this.enableRotate) this.handleTouchMoveRotate(event);
  };

  private handleTouchEnd(/*event*/) {
    // no-op
  }

  //
  // event handlers - FSM: listen for events and reset state
  //

  private onMouseDown = event => {
    if (this.enabled === false) return;

    // Prevent the browser from scrolling.

    event.preventDefault?.();

    // Manually set the focus since calling preventDefault above
    // prevents the browser from setting it automatically.

    this.domElement.focus ? this.domElement.focus() : window.focus();

    switch (event.button) {
      case 0:
        switch (this.mouseButtons.LEFT) {
          case MOUSE.ROTATE:
            if (event.ctrlKey || event.metaKey || event.shiftKey) {
              if (this.enablePan === false) return;

              this.handleMouseDownPan(event);

              this.state = STATE.PAN;
            } else {
              if (this.enableRotate === false) return;

              this.handleMouseDownRotate(event);

              this.state = STATE.ROTATE;
            }

            break;

          case MOUSE.PAN:
            if (event.ctrlKey || event.metaKey || event.shiftKey) {
              if (this.enableRotate === false) return;

              this.handleMouseDownRotate(event);

              this.state = STATE.ROTATE;
            } else {
              if (this.enablePan === false) return;

              this.handleMouseDownPan(event);

              this.state = STATE.PAN;
            }

            break;

          default:
            this.state = STATE.NONE;
        }

        break;

      case 1:
        switch (this.mouseButtons.MIDDLE) {
          case MOUSE.DOLLY:
            if (this.enableZoom === false) return;

            this.handleMouseDownDolly(event);

            this.state = STATE.DOLLY;

            break;

          default:
            this.state = STATE.NONE;
        }

        break;

      case 2:
        switch (this.mouseButtons.RIGHT) {
          case MOUSE.ROTATE:
            if (this.enableRotate === false) return;

            this.handleMouseDownRotate(event);

            this.state = STATE.ROTATE;

            break;

          case MOUSE.PAN:
            if (this.enablePan === false) return;

            this.handleMouseDownPan(event);

            this.state = STATE.PAN;

            break;

          default:
            this.state = STATE.NONE;
        }

        break;
    }

    if (this.state !== STATE.NONE) {
      if (useDOM) {
        window.document.addEventListener('mousemove', this.onMouseMove, false);
        window.document.addEventListener('mouseup', this.onMouseUp, false);
      }

      this.dispatchEvent(this.startEvent);
    }
  };

  private onMouseMove = event => {
    if (this.enabled === false) return;

    event.preventDefault?.();

    switch (this.state) {
      case STATE.ROTATE:
        if (this.enableRotate === false) return;

        this.handleMouseMoveRotate(event);

        break;

      case STATE.DOLLY:
        if (this.enableZoom === false) return;

        this.handleMouseMoveDolly(event);

        break;

      case STATE.PAN:
        if (this.enablePan === false) return;

        this.handleMouseMovePan(event);

        break;
    }
  };

  private onMouseUp = event => {
    if (this.enabled === false) return;

    this.handleMouseUp(/* event */);

    if (useDOM) {
      window.document.removeEventListener('mousemove', this.onMouseMove, false);
      window.document.removeEventListener('mouseup', this.onMouseUp, false);
    }

    this.dispatchEvent(this.endEvent);

    this.state = STATE.NONE;
  };

  onMouseWheel = event => {
    if (
      this.enabled === false ||
      this.enableZoom === false ||
      (this.state !== STATE.NONE && this.state !== STATE.ROTATE)
    )
      return;

    event.preventDefault?.();
    event.stopPropagation?.();

    this.dispatchEvent(this.startEvent);

    this.handleMouseWheel(event);

    this.dispatchEvent(this.endEvent);
  };

  onKeyDown = event => {
    if (
      this.enabled === false ||
      this.enableKeys === false ||
      this.enablePan === false
    )
      return;

    this.handleKeyDown(event);
  };

  onTouchStart = event => {
    if (this.enabled === false) return;

    event.preventDefault?.();

    switch (event.touches.length) {
      case 1:
        switch (this.touches.ONE) {
          case TOUCH.ROTATE:
            if (this.enableRotate === false) return;

            this.handleTouchStartRotate(event);

            this.state = STATE.TOUCH_ROTATE;

            break;

          case TOUCH.PAN:
            if (this.enablePan === false) return;

            this.handleTouchStartPan(event);

            this.state = STATE.TOUCH_PAN;

            break;

          default:
            this.state = STATE.NONE;
        }

        break;

      case 2:
        switch (this.touches.TWO) {
          case TOUCH.DOLLY_PAN:
            if (this.enableZoom === false && this.enablePan === false) return;

            this.handleTouchStartDollyPan(event);

            this.state = STATE.TOUCH_DOLLY_PAN;

            break;

          case TOUCH.DOLLY_ROTATE:
            if (this.enableZoom === false && this.enableRotate === false)
              return;

            this.handleTouchStartDollyRotate(event);

            this.state = STATE.TOUCH_DOLLY_ROTATE;

            break;

          default:
            this.state = STATE.NONE;
        }

        break;

      default:
        this.state = STATE.NONE;
    }

    if (this.state !== STATE.NONE) {
      this.dispatchEvent(this.startEvent);
    }
  };

  onTouchMove = event => {
    if (this.enabled === false) return;

    event.preventDefault?.();
    event.stopPropagation?.();

    switch (this.state) {
      case STATE.TOUCH_ROTATE:
        if (this.enableRotate === false) return;

        this.handleTouchMoveRotate(event);

        this.update();

        break;

      case STATE.TOUCH_PAN:
        if (this.enablePan === false) return;

        this.handleTouchMovePan(event);

        this.update();

        break;

      case STATE.TOUCH_DOLLY_PAN:
        if (this.enableZoom === false && this.enablePan === false) return;

        this.handleTouchMoveDollyPan(event);

        this.update();

        break;

      case STATE.TOUCH_DOLLY_ROTATE:
        if (this.enableZoom === false && this.enableRotate === false) return;

        this.handleTouchMoveDollyRotate(event);

        this.update();

        break;

      default:
        this.state = STATE.NONE;
    }
  };

  onTouchEnd = event => {
    if (this.enabled === false) return;

    this.handleTouchEnd(/* event */);

    this.dispatchEvent(this.endEvent);

    this.state = STATE.NONE;
  };

  onContextMenu = event => {
    if (this.enabled === false) return;

    event.preventDefault?.();
  };
}
