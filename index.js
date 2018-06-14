import React from 'react';
import { PanResponder, View } from 'react-native';
const THREE = require('three');
const Controls = require('./lib/OrbitControls');
import PropTypes from 'prop-types';


class OrbitControls extends React.Component {

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
    const controls = new Controls(camera, width, height);
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

OrbitControls.propTypes = {
  width: PropTypes.number,
  height: PropTypes.number,
}

OrbitControls.defaultProps = {
  width: 0,
  height: 0,
  camera: null,
}

export default OrbitControls;
