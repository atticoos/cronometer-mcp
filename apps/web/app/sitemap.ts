import type { MetadataRoute } from "next";
import { productionUrl } from "./site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: productionUrl.href }];
}
