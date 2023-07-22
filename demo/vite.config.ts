import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ command }) => ({
	plugins: [basicSsl()],
	build: {
		target: "es2022",
	},
	base: command === "build" ? "/webnect/" : "",
}));
