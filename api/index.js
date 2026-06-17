// MUST be first — initializes Shopify's Node.js crypto/fetch adapters
import "@shopify/shopify-app-react-router/adapters/node";

import { createRequestListener } from "@react-router/node";
import * as build from "../build/server/index.js";

export default createRequestListener({ build });
