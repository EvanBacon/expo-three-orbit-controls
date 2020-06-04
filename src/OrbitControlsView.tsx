import * as React from 'react';
import { View, Platform, ViewProps, PanResponder } from 'react-native';
import { Camera } from 'three';

import { OrbitControls } from './OrbitControls';

export type OrbitControlsViewProps = { camera: null | Camera } & ViewProps;

function polyfillEventTouches(nativeEvent) {
  if (Platform.OS === 'web') return nativeEvent;
  if (!Array.isArray(nativeEvent.touches)) nativeEvent.touches = [];

  if (Array.isArray(nativeEvent.changedTouches)) {
    if (!nativeEvent.touches.length) {
      nativeEvent.touches = nativeEvent.changedTouches;
    }
  }

  return nativeEvent;
}

const OrbitControlsView = React.forwardRef(
  ({ camera, ...props }: OrbitControlsViewProps, ref) => {
    const [size, setSize] = React.useState<null | {
      width: number;
      height: number;
    }>(null);

    const viewRef = React.useRef(null);

    const controls: OrbitControls | null = React.useMemo(() => {
      if (camera && viewRef?.current) {
        return new OrbitControls(camera as any, viewRef.current);
      }
      return null;
    }, [camera, viewRef?.current]);

    React.useImperativeHandle(
      ref,
      () => ({
        getControls(): OrbitControls | null {
          return controls;
        },
      }),
      [controls]
    );

    const responder = React.useMemo(() => {
      function onTouchEnded(nativeEvent) {
        const polyfill = polyfillEventTouches(nativeEvent);

        // If only one touch then we may be encountering the bug where pan responder returns a two finger touch-end event in two different calls. :/
        // RNGH doesn't have this issue.
        const isMisfiredNativeGesture =
          Platform.OS !== 'web' && nativeEvent.identifier > 1;

        if (isMisfiredNativeGesture) {
          return;
        }

        return controls?.onTouchEnd(polyfill);
      }

      return PanResponder.create({
        onStartShouldSetPanResponder: (evt, gestureState) => true,
        onStartShouldSetPanResponderCapture: (evt, gestureState) => true,
        onMoveShouldSetPanResponder: (evt, gestureState) => true,
        onMoveShouldSetPanResponderCapture: (evt, gestureState) => true,

        onPanResponderGrant({ nativeEvent }) {
          return controls?.onTouchStart(nativeEvent);
        },
        onPanResponderMove({ nativeEvent }) {
          return controls?.onTouchMove(nativeEvent);
        },
        onPanResponderRelease({ nativeEvent }) {
          return onTouchEnded(nativeEvent);
        },
        onPanResponderTerminate({ nativeEvent }) {
          return onTouchEnded(nativeEvent);
        },
      });
    }, [controls]);

    React.useEffect(() => {
      if (!controls || !size) {
        return;
      }
      controls.width = size.width;
      controls.height = size.height;
    }, [size, controls]);

    return (
      <View
        {...props}
        ref={viewRef}
        {...responder.panHandlers}
        onLayout={event => {
          if (props.onLayout) {
            props.onLayout(event);
          }
          setSize(event.nativeEvent.layout);
        }}
      />
    );
  }
);

export default OrbitControlsView;
