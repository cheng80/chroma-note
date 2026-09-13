import { DEMO_IMAGE_HEIGHT, DEMO_IMAGE_WIDTH } from './contract';
import type { DemoImageAsset, DemoImageSources } from './contract';

export const demoAssets: { photo: DemoImageAsset; stamp: DemoImageAsset } = {
  photo: {
    source: require('../../assets/images/demo-source-photo.jpg'),
    width: DEMO_IMAGE_WIDTH,
    height: DEMO_IMAGE_HEIGHT,
    aspect_ratio: DEMO_IMAGE_WIDTH / DEMO_IMAGE_HEIGHT,
  },
  stamp: {
    source: require('../../assets/images/demo-stamp.jpg'),
    width: DEMO_IMAGE_WIDTH,
    height: DEMO_IMAGE_HEIGHT,
    aspect_ratio: DEMO_IMAGE_WIDTH / DEMO_IMAGE_HEIGHT,
  },
};

export const demoImages: DemoImageSources = {
  photo: demoAssets.photo.source,
  stamp: demoAssets.stamp.source,
};
