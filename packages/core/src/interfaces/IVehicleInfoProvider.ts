import { VehicleSpecs } from '../types/models';

export interface IVehicleInfoProvider {
    getVehicleSpecs(vin: string): Promise<VehicleSpecs>;
}
