// Vercel serverless entry point for BargainBot (React Router + Shopify)
// @react-router/node exports createRequestListener, not createRequestHandler
import { createRequestListener } from "@react-router/node";
import * as build from "../build/server/index.js";

export default createRequestListener({ build });
