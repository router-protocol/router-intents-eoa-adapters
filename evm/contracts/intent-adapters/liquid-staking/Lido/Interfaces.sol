// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface ILidoStakeEth {
    function submit(address _referral) external payable returns (uint256);
}

interface ILidoStakeMatic {
    function submit(
        uint256 _amount,
        address _referral
    ) external returns (uint256);
}

interface ILidoArbitrumBridge {
    function outboundTransfer(
        address l1Token_,
        address to_,
        uint256 amount_,
        uint256 maxGas_,
        uint256 gasPriceBid_,
        bytes calldata data_
    ) external payable returns (bytes memory);
}

interface ILidoOptBaseMan {
    function depositERC20To(
        address l1Token_,
        address l2Token_,
        address to_,
        uint256 amount_,
        uint32 l2Gas_,
        bytes calldata data_
    ) external;
}

interface ILidoZkSyncBridge {
    function deposit(
        address _l2Receiver,
        address _l1Token,
        uint256 _amount,
        uint256 _l2TxGasLimit,
        uint256 _l2TxGasPerPubdataByte,
        address _refundRecipient
    ) external payable returns (bytes32 l2TxHash);

    function zkSync() external view returns (IZkSync);
}

interface IZkSync {
    function l2TransactionBaseCost(
        uint256 _gasPrice,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit
    ) external pure returns (uint256);
}

interface ILidoLineaBridge {
    function bridgeToken(
        address _token,
        uint256 _amount,
        address _recipient
    ) external payable;
}

interface IWstEth {
    function wrap(uint256 _stETHAmount) external returns (uint256);
}

interface IScrollMessageQueue {
    function estimateCrossDomainMessageFee(
        uint256 _gasLimit
    ) external view returns (uint256);
}

interface ILidoScrollBridge {
    function depositERC20(
        address _token,
        address _to,
        uint256 _amount,
        uint256 _gasLimit
    ) external payable;
}
