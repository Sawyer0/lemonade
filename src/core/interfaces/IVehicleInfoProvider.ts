export interface VehicleSpecs {
    year: number;
    make: string;
    model: string;
    engine: string;
    trim?: string;
}

export interface IVehicleInfoProvider {
    getVehicleSpecs(vin: string): Promise<VehicleSpecs>;
}
