/*

  Example showing how to integrate with expo-three demo.
  https://github.com/expo/expo-three

*/


import Expo from 'expo';
import React from 'react';
import { View } from 'react-native';

const THREE = require('three');
import ExpoTHREE from 'expo-three';
import OrbitControls from 'expo-three-orbit-controls';


// THREE warns us about some GL extensions that `Expo.GLView` doesn't support
// yet. This is ok, most things will still work, and we'll support those
// extensions hopefully soon.
console.ignoredYellowBox = [
  'THREE.WebGLRenderer',
  'THREE.WebGLProgram',
];

class App extends React.Component {
  state = {
    camera: null
  }
  render() {
    // Create an `Expo.GLView` covering the whole screen, tell it to call our
    // `_onGLContextCreate` function once it's initialized.
    return (
      <OrbitControls
        style={{flex: 1}}
        camera={this.state.camera}>
        <Expo.GLView
          style={{ flex: 1 }}
          onContextCreate={this._onGLContextCreate}/>
      </OrbitControls>
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

        renderer.render(scene, camera);

        // NOTE: At the end of each frame, notify `Expo.GLView` with the below
        gl.endFrameEXP();
      }
      render();

      this.setState({camera: camera})
    }
  }

  Expo.registerRootComponent(App);
