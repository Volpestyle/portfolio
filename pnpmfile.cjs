const fs = require("fs");
const path = require("path");

const LOCAL_DEVOPS_LINK =
  "link:../../Library/pnpm/global/5/node_modules/@volpestyle/devops";
const LOCAL_DEVOPS_ABS = path.resolve(
  __dirname,
  "../../Library/pnpm/global/5/node_modules/@volpestyle/devops"
);

module.exports = {
  hooks: {
    readPackage(pkg) {
      const isCi = process.env.CI === "true" || process.env.CI === "1";
      const isProd = process.env.NODE_ENV === "production";
      const forceLocal = process.env.USE_LOCAL_DEVOPS === "1";
      const disableLocal = process.env.USE_LOCAL_DEVOPS === "0";

      if (disableLocal || isCi || isProd) return pkg;

      const hasLocal = fs.existsSync(LOCAL_DEVOPS_ABS);
      if (!forceLocal && !hasLocal) return pkg;

      const depKeys = ["dependencies", "devDependencies", "optionalDependencies"];
      for (const key of depKeys) {
        if (pkg[key]?.["@volpestyle/devops"]) {
          pkg[key]["@volpestyle/devops"] = LOCAL_DEVOPS_LINK;
        }
      }

      return pkg;
    },
  },
};
