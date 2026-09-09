import { DEMO_IMAGE_HEIGHT, DEMO_IMAGE_WIDTH } from './contract';
import type { DemoImageAsset, DemoImageSources } from './contract';

export const demoAssets: { photo: DemoImageAsset; stamp: DemoImageAsset } = {
  photo: {
    source: require('../../design/images/generated-1788887280309.png'),
    width: DEMO_IMAGE_WIDTH,
    height: DEMO_IMAGE_HEIGHT,
    aspect_ratio: DEMO_IMAGE_WIDTH / DEMO_IMAGE_HEIGHT,
  },
  stamp: {
    source: require('../../design/images/generated-1788887279815.png'),
    width: DEMO_IMAGE_WIDTH,
    height: DEMO_IMAGE_HEIGHT,
    aspect_ratio: DEMO_IMAGE_WIDTH / DEMO_IMAGE_HEIGHT,
  },
};

export const demoImages: DemoImageSources = {
  photo: demoAssets.photo.source,
  stamp: demoAssets.stamp.source,
};
