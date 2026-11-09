import type { Frame, ReadResult } from '../core/types';
import { readAnalog, type AnalogCalibration } from './analog';
import { readDigital, type DigitalCalibration } from './digital';

export type Calibration = AnalogCalibration | DigitalCalibration;

export function readChannel(frame: Frame, cal: Calibration): ReadResult {
  return cal.type === 'analog' ? readAnalog(frame, cal) : readDigital(frame, cal);
}
export type { AnalogCalibration, DigitalCalibration };
