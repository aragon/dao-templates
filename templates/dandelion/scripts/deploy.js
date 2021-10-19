const deployTemplate = require("@aragon/templates-shared/scripts/deploy-template");

const TEMPLATE_NAME = "dandelion-org-template";
const CONTRACT_NAME = "DandelionOrg";

module.exports = async callback => {
  try {
    const template = await deployTemplate(
      web3,
      artifacts,
      TEMPLATE_NAME,
      CONTRACT_NAME
    );
    console.log(template.address);
  } catch (error) {
    callback(error);
  }
  callback();
};
