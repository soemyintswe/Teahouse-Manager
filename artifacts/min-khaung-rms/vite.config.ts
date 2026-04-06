import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Windows Environment အတွက် သင့်တော်အောင် ပြင်ဆင်ထားသော Config
export default defineConfig({
  // Base path ကို default "/" ပဲ ထားပေးလိုက်ပါတယ်
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    // Replit plugins တွေကို ဖယ်ထုတ်လိုက်ပါပြီ
  ],
  resolve: {
    alias: {
      // Path တွေကို Uncle ရဲ့ စက်ထဲက folder တည်ဆောက်ပုံနဲ့ ကိုက်အောင် ပြင်ထားပါတယ်
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "public"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    // Port ကို အသေ (5173) သတ်မှတ်ပေးလိုက်ပါတယ်
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port: 5173,
    host: "0.0.0.0",
  },
});
