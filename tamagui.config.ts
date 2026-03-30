import { config } from '@tamagui/config';
import { createTamagui } from 'tamagui';

export const tamaguiConfig = createTamagui({
  ...config,
});

export default tamaguiConfig;

export type TamaguiConfig = typeof tamaguiConfig;
declare module 'tamagui' {
  interface TamaguiCustomConfig extends TamaguiConfig {}
}

