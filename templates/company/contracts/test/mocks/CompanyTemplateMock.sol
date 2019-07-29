pragma solidity ^0.4.24;

import "../../CompanyTemplate.sol";


contract CompanyTemplateMock is CompanyTemplate {

    function newTokenAndInstanceWithoutPayroll(
        string _tokenName,
        string _tokenSymbol,
        string _id,
        address[] _holders,
        uint256[] _stakes,
        uint64[3] _votingSettings, /* supportRequired, minAcceptanceQuorum, voteDuration */
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        external
    {
        this.newTokenAndInstance(_tokenName, _tokenSymbol, _id, _holders, _stakes, _votingSettings, _financePeriod, _useAgentAsVault);
    }

    function newTokenAndInstanceWithPayroll(
        string _tokenName,
        string _tokenSymbol,
        string _id,
        address[] _holders,
        uint256[] _stakes,
        uint64[3] _votingSettings, /* supportRequired, minAcceptanceQuorum, voteDuration */
        uint64 _financePeriod,
        bool _useAgentAsVault,
        uint256[3] _payrollSettings /* address denominationToken , IFeed priceFeed, uint64 rateExpiryTime */
    )
        external
    {
        this.newTokenAndInstance(_tokenName, _tokenSymbol, _id, _holders, _stakes, _votingSettings, _financePeriod, _useAgentAsVault, _payrollSettings);
    }

    function newInstanceWithoutPayroll(string _id, address[] _holders, uint256[] _stakes, uint64[3] _votingSettings, uint64 _financePeriod, bool _useAgentAsVault) public {
        newInstance(_id, _holders, _stakes, _votingSettings, _financePeriod, _useAgentAsVault);
    }

    function newInstanceWithPayroll(
        string _id,
        address[] _holders,
        uint256[] _stakes,
        uint64[3] _votingSettings,
        uint64 _financePeriod,
        bool _useAgentAsVault,
        uint256[3] _payrollSettings /* address denominationToken , IFeed priceFeed, uint64 rateExpiryTime */
    )
        public
    {
        newInstance(_id, _holders, _stakes, _votingSettings, _financePeriod, _useAgentAsVault, _payrollSettings);
    }
}
