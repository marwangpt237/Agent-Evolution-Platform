import express, { type Express, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "./lib/logger.js";
import router from "./routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createApp(): Express {
  const app = express();

  // JSON body parser
  app.use(express.json({ limit: "10mb" }));

  // API routes
  app.use("/api", router);

  // Serve frontend static files in production
  if (process.env.NODE_ENV === "production") {
    // In the Docker image, we'll place it relative to the server dist
    const publicPath = path.resolve(__dirname, "../../algdevs-ai/dist/public");
    
    app.use(express.static(publicPath));
    
    // Express 5 catch-all route - use /{*splat} syntax
    app.get("/{*splat}", (req: Request, res: Response) => {
      if (req.path.startsWith("/api")) return;
      res.sendFile(path.join(publicPath, "index.html"));
    });
  }

  return app;
}

export default createApp();
