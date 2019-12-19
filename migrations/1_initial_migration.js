const Migrations = artifacts.require("Migrations");
const SimplePaymentChannel = artifacts.require("SimplePaymentChannel");
const MultipartyChannel = artifacts.require("MultipartyChannel");

module.exports = function(deployer) {
  deployer.deploy(Migrations);
  deployer.deploy(SimplePaymentChannel);
  deployer.deploy(MultipartyChannel);
};
