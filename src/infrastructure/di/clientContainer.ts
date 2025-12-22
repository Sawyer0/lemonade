import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types";

import { IAuthService, ILogger } from "@lemonade/core";

import { AuthService } from "@/infrastructure/auth/AuthService";
import { ClientLogger } from "@/infrastructure/logging/ClientLogger"; // Import ClientLogger

const clientContainer = new Container();

clientContainer.bind<IAuthService>(TYPES.AuthService).to(AuthService).inSingletonScope();
clientContainer.bind<ILogger>(TYPES.Logger).to(ClientLogger).inSingletonScope(); // Bind to ClientLogger

export { clientContainer };

