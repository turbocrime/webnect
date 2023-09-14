import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ command }) => ({
	plugins: [basicSsl()],
	build: {
		target: "es2022",
		rollupOptions: {
			output: {
				manualChunks: {
					worker: ["@webnect/webnect/worker"],
				},
			},
		},
	},
}));
