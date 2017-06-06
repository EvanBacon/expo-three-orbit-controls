import Expo from 'expo';
import React from 'react';
import { PanResponder, View } from 'react-native';

const THREE = require('three');
// global.THREE = THREE;
// require('three/src/core/EventDispatcher');

import ExpoTHREE from 'expo-three';


// THREE warns us about some GL extensions that `Expo.GLView` doesn't support
// yet. This is ok, most things will still work, and we'll support those
// extensions hopefully soon.
// console.disableYellowBox = true;

console.ignoredYellowBox = [
  'THREE.WebGLRenderer',
  'THREE.WebGLProgram',
];

const OrbitControls = require('./OrbitControls');


import Gestures from 'react-native-easy-gestures';


export class Controls extends React.Component {

  constructor(props) {
    super(props);

    const {camera, width, height} = props;
    this.state = {
      ...this.updateWithCamera(camera, width, height),
      width,
      height,
    };
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.camera != this.props.camera) {
      const {width, height} = this.state;
      this.setState(this.updateWithCamera(nextProps.camera, width, height));
    }
  }

  updateWithCamera = (camera, width, height) => {
    if (!camera) return null;
    const controls = new OrbitControls(camera, width, height);
    return {
      controls,
      panResponder: this.buildGestures(controls)
    }
  }

  buildGestures = ({onTouchStart, onTouchMove, onTouchEnd}) => PanResponder.create({
    onStartShouldSetPanResponder: (evt, gestureState) => true,
    onStartShouldSetPanResponderCapture: (evt, gestureState) => true,
    onMoveShouldSetPanResponder: (evt, gestureState) => true,
    onMoveShouldSetPanResponderCapture: (evt, gestureState) => true,

    onPanResponderGrant: (({nativeEvent}) => onTouchStart(nativeEvent)),
    onPanResponderMove: (({nativeEvent}) => onTouchMove(nativeEvent)),
    onPanResponderRelease: (({nativeEvent}) => onTouchEnd(nativeEvent)),
    onPanResponderTerminate: (({nativeEvent}) => onTouchEnd(nativeEvent)),
  })

  render() {
    const {
      children,
      style,
      ...props
    } = this.props;

    const {
      controls,
      panResponder
    } = this.state;

    return (
      <View
        style={style}
        {...(panResponder || {}).panHandlers}
        onLayout={ ({nativeEvent:{layout:{width, height}}}) => {
          this.setState({width, height});
          if (controls) {
            this.state.controls.clientWidth = width;
            this.state.controls.clientHeight = height;
          }
        }}>
        {children}
      </View>
    )
  }
}
Controls.propTypes = {
  width: React.PropTypes.number,
  height:  React.PropTypes.number,
}
Controls.defaultProps = {
  width: 0,
  height: 0,
  camera: null,
}


class App extends React.Component {
  state = {
    camera: null
  }
  render() {
    // Create an `Expo.GLView` covering the whole screen, tell it to call our
    // `_onGLContextCreate` function once it's initialized.
    return (
      <Controls
        style={{flex: 1}}
        camera={this.state.camera}>
        <Expo.GLView
          style={{ flex: 1 }}
          onContextCreate={this._onGLContextCreate}/>
      </Controls>
    );
  }

  // This is called by the `Expo.GLView` once it's initialized
  _onGLContextCreate = async (gl) => {
    // Based on https://threejs.org/docs/#manual/introduction/Creating-a-scene
    // In this case we instead use a texture for the material (because textures
    // are cool!). All differences from the normal THREE.js example are
    // indicated with a `NOTE:` comment.

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000);

      // NOTE: How to create an `Expo.GLView`-compatible THREE renderer
      const renderer = ExpoTHREE.createRenderer({ gl });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor('red', 1);
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshBasicMaterial({
        // NOTE: How to create an Expo-compatible THREE texture
        map: await ExpoTHREE.createTextureAsync({
          asset: Expo.Asset.fromModule(require('./assets/icons/app.png')),
        }),
      });
      const cube = new THREE.Mesh(geometry, material);
      scene.add(cube);

      camera.position.z = 5;

      const render = () => {
        requestAnimationFrame(render);

        // cube.rotation.x += 0.07;
        // cube.rotation.y += 0.04;

        renderer.render(scene, camera);

        // NOTE: At the end of each frame, notify `Expo.GLView` with the below
        gl.endFrameEXP();
      }
      render();

      this.setState({camera: camera})
    }
  }

  Expo.registerRootComponent(App);
