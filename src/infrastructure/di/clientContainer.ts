import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types";

// Interfaces
import { IAuthService } from "@/core/interfaces/IAuthService";
import { ILogger } from "@/core/interfaces/ILogger";

// Implementations
import { AuthService } from "@/infrastructure/auth/AuthService";
import { Logger } from "@/infrastructure/logging/Logger";

const clientContainer = new Container();

// Bind Client-Safe Services
clientContainer.bind<IAuthService>(TYPES.AuthService).to(AuthService).inSingletonScope();
clientContainer.bind<ILogger>(TYPES.Logger).to(Logger).inSingletonScope();

export { clientContainer };
