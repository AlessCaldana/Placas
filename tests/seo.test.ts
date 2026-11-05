import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonLdText, siteUrl, storeStructuredData } from "@/lib/seo";
import { defaultSiteSettings } from "@/lib/services/site-settings";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("search engine data", () => {
  it("uses the public address without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://pfdeco.eu/");
    expect(siteUrl()).toBe("https://pfdeco.eu");
    expect(sitemap()[0]).toMatchObject({ url: "https://pfdeco.eu/", priority: 1 });
    expect(robots().sitemap).toBe("https://pfdeco.eu/sitemap.xml");
  });

  it("keeps the admin, the API and the login out of search engines", () => {
    const { rules } = robots();
    expect(Array.isArray(rules) ? rules[0].disallow : rules.disallow).toEqual(["/admin", "/api/", "/login", "/ordine/"]);
  });

  it("lists PFdeco as an alternate name and cannot close the script tag", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://pfdeco.eu");
    const settings = { ...defaultSiteSettings(), name: "PFdecostylevint</script><b>" };
    const [store] = storeStructuredData(settings, "Targhe");
    expect(store.alternateName).toEqual(["PFdeco", "pfdeco.eu"]);
    const text = jsonLdText(storeStructuredData(settings, "Targhe"));
    expect(text).not.toContain("</script>");
    expect(JSON.parse(text)[0].name).toBe(settings.name);
  });
});
