import { environment, closeMainWindow, getPreferenceValues, Clipboard, showHUD, LocalStorage } from "@raycast/api";
import { join } from "path";
import { execFileSync, execSync } from "child_process";
import fs from "fs";

export default async () => {
  await closeMainWindow();
  const savePath = join(environment.supportPath, "capture.png");

  execSync(`/usr/sbin/screencapture -i '${savePath}'`);
  if (!fs.existsSync(savePath)) {
    await showHUD("❌ Screenshot failed");
    return;
  }
  let stage = "HTTP request";
  try {
    const token = getPreferenceValues<{ token: string }>().token.trim();
    if (!token || /[\r\n]/.test(token)) {
      await showHUD("❌ Invalid SimpleTex API key");
      return;
    }

    const response = execFileSync(
      "/usr/bin/curl",
      [
        "--silent",
        "--show-error",
        "--max-time",
        "15",
        "--header",
        "@-",
        "--form",
        `file=@${savePath}`,
        "--write-out",
        "\n%{http_code}",
        "https://server.simpletex.cn/api/latex_ocr",
      ],
      { input: `token: ${token}\n`, encoding: "utf8" },
    );
    const statusOffset = response.lastIndexOf("\n");
    const status = Number(response.slice(statusOffset + 1));
    if (status < 200 || status >= 300) {
      await showHUD(`❌ SimpleTex HTTP ${status}`);
      return;
    }

    stage = "API response validation";
    const data = JSON.parse(response.slice(0, statusOffset));
    if (!data.status) {
      throw new Error("API Response Error");
    }
    stage = "Reading output format";
    const format = (await LocalStorage.getItem<string>("format")) ?? "raw";
    stage = "Writing to clipboard";
    switch (format) {
      case "raw":
        await Clipboard.copy(data.res.latex);
        break;
      case "inline":
        await Clipboard.copy(`$${data.res.latex}$`);
        break;
      case "block":
        await Clipboard.copy(`$$\n${data.res.latex}\n$$`);
        break;
      default:
        await Clipboard.copy(data.res.latex);
        break;
    }
  } catch {
    await showHUD(`❌ OCR failed: ${stage}`);
    return;
  } finally {
    fs.unlinkSync(savePath);
  }
  await showHUD("✅ OCR Success");
};
