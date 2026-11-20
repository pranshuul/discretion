import { describe, expect, it } from "vitest";
import { pinnedPlugins, releaseUrl, type PinnedPlugin } from "../src/pins.js";

describe("the pinned plugins", () => {
  it("are Templater, Dataview and Meta Bind at the verified releases and hashes", () => {
    expect(pinnedPlugins).toEqual([
      {
        id: "dataview",
        name: "Dataview",
        repo: "blacksmithgu/obsidian-dataview",
        version: "0.5.68",
        files: {
          "main.js": "794e9eaede73920bb8d54b0eda4f5de2182d698cc638774500f24f14bcd4da0b",
          "manifest.json": "9235db47112da81b85591c79ecb9ae2574e5e72207056e976472f90616286185",
          "styles.css": "3306dd9032e00f989ba7233a37fd255bc4d3f4340cee661762e952f3f6aa1de9",
        },
      },
      {
        id: "obsidian-meta-bind-plugin",
        name: "Meta Bind",
        repo: "mProjectsCode/obsidian-meta-bind-plugin",
        version: "1.5.1",
        files: {
          "main.js": "d328bfaa4d1f48259074b28f249a9f911ea34327e7e1123d8a1f2afc3e9784b3",
          "manifest.json": "3c1dff1e36a17811851f3c7446b875cf901288b73261caea61bc0d440d3c4325",
          "styles.css": "97069e183224c55428fe0b983d42435aa2cd4ac14d0f50186138b4751ad55d61",
        },
      },
      {
        id: "templater-obsidian",
        name: "Templater",
        repo: "SilentVoid13/Templater",
        version: "2.27.0",
        files: {
          "main.js": "0b4a22e7a3871f929e18656d9f3c7defd8588c9dc5845620b9a16e0adb7c9a2f",
          "manifest.json": "a9d10df447b9ce60e72df775cea66f246dacaac1f2e508b023585552f08be900",
          "styles.css": "67a6dd2d1d6dedca1287c334ca884ec4196433f71ca47388a0bd3eac14cf8b5f",
        },
      },
    ]);
  });

  it("builds the official GitHub release URL of a file", () => {
    const dataview = pinnedPlugins.find((p) => p.id === "dataview") as PinnedPlugin;
    expect(releaseUrl("https://github.com", dataview, "main.js")).toBe(
      "https://github.com/blacksmithgu/obsidian-dataview/releases/download/0.5.68/main.js",
    );
  });
});
