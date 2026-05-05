import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function skillforgeExtension(pi: ExtensionAPI) {
	pi.registerCommand("skillforge", {
		description: "Show pi-skillforge status",
		handler: async (_args, ctx) => {
			ctx.ui.notify("pi-skillforge is loaded.", "info");
		},
	});
}
