// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract RageQuitEscrow {
    enum DecisionType {
        Queued,
        Vetoed,
        Executed
    }

    struct PendingPayment {
        address agent;
        address recipient;
        uint256 amount;
        uint256 unlocksAt;
        bytes32 intentHash;
        bool vetoed;
        bool executed;
    }

    error NotOwner();
    error NotAuthorizedAgent();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidAddress();
    error SpendLimitExceeded();
    error InsufficientEscrowBalance();
    error PaymentNotFound();
    error PaymentAlreadyVetoed();
    error PaymentAlreadyExecuted();
    error VetoWindowClosed();
    error VetoWindowOpen();
    error TransferFailed();

    address public owner;
    address public authorizedAgent;
    uint256 public vetoWindow;
    uint256 public spendLimit;
    uint256 public nextPaymentId;
    uint256 public lockedBalance;

    mapping(uint256 => PendingPayment) public pendingPayments;

    event PaymentQueued(
        uint256 indexed paymentId,
        address indexed agent,
        address indexed recipient,
        uint256 amount,
        uint256 unlocksAt,
        bytes32 intentHash
    );
    event PaymentVetoed(
        uint256 indexed paymentId,
        address indexed owner,
        uint256 timestamp
    );
    event PaymentExecuted(
        uint256 indexed paymentId,
        address indexed executor,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );
    event PaymentDecisionLogged(
        uint256 indexed paymentId,
        DecisionType indexed decisionType,
        address indexed actor,
        address agent,
        address recipient,
        uint256 amount,
        bytes32 intentHash,
        uint256 timestamp
    );
    event ConfigUpdated(
        address indexed owner,
        address indexed authorizedAgent,
        uint256 vetoWindow,
        uint256 spendLimit
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAuthorizedAgent() {
        if (msg.sender != authorizedAgent) revert NotAuthorizedAgent();
        _;
    }

    constructor(
        address _owner,
        address _authorizedAgent,
        uint256 _vetoWindow,
        uint256 _spendLimit
    ) {
        if (_owner == address(0) || _authorizedAgent == address(0))
            revert InvalidAddress();
        if (_spendLimit == 0) revert InvalidAmount();

        owner = _owner;
        authorizedAgent = _authorizedAgent;
        vetoWindow = _vetoWindow;
        spendLimit = _spendLimit;

        emit ConfigUpdated(owner, authorizedAgent, vetoWindow, spendLimit);
    }

    receive() external payable {}

    function fund() external payable onlyOwner {}

    function setAuthorizedAgent(address newAuthorizedAgent) external onlyOwner {
        if (newAuthorizedAgent == address(0)) revert InvalidAddress();
        authorizedAgent = newAuthorizedAgent;
        emit ConfigUpdated(owner, authorizedAgent, vetoWindow, spendLimit);
    }

    function setVetoWindow(uint256 newVetoWindow) external onlyOwner {
        vetoWindow = newVetoWindow;
        emit ConfigUpdated(owner, authorizedAgent, vetoWindow, spendLimit);
    }

    function setSpendLimit(uint256 newSpendLimit) external onlyOwner {
        if (newSpendLimit == 0) revert InvalidAmount();
        spendLimit = newSpendLimit;
        emit ConfigUpdated(owner, authorizedAgent, vetoWindow, spendLimit);
    }

    function initiate(
        address recipient,
        uint256 amount,
        bytes32 intentHash
    ) external onlyAuthorizedAgent returns (uint256 paymentId) {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (amount > spendLimit) revert SpendLimitExceeded();
        if (availableBalance() < amount) revert InsufficientEscrowBalance();

        paymentId = nextPaymentId;
        nextPaymentId = paymentId + 1;

        uint256 unlocksAt = block.timestamp + vetoWindow;
        pendingPayments[paymentId] = PendingPayment({
            agent: msg.sender,
            recipient: recipient,
            amount: amount,
            unlocksAt: unlocksAt,
            intentHash: intentHash,
            vetoed: false,
            executed: false
        });

        lockedBalance += amount;

        emit PaymentQueued(
            paymentId,
            msg.sender,
            recipient,
            amount,
            unlocksAt,
            intentHash
        );
        emit PaymentDecisionLogged(
            paymentId,
            DecisionType.Queued,
            msg.sender,
            msg.sender,
            recipient,
            amount,
            intentHash,
            block.timestamp
        );
    }

    function veto(uint256 paymentId) external onlyOwner {
        PendingPayment storage payment = _getPayment(paymentId);

        if (payment.vetoed) revert PaymentAlreadyVetoed();
        if (payment.executed) revert PaymentAlreadyExecuted();
        if (block.timestamp >= payment.unlocksAt) revert VetoWindowClosed();

        payment.vetoed = true;
        lockedBalance -= payment.amount;

        emit PaymentVetoed(paymentId, msg.sender, block.timestamp);
        emit PaymentDecisionLogged(
            paymentId,
            DecisionType.Vetoed,
            msg.sender,
            payment.agent,
            payment.recipient,
            payment.amount,
            payment.intentHash,
            block.timestamp
        );
    }

    function execute(uint256 paymentId) external {
        PendingPayment storage payment = _getPayment(paymentId);

        if (payment.vetoed) revert PaymentAlreadyVetoed();
        if (payment.executed) revert PaymentAlreadyExecuted();
        if (block.timestamp < payment.unlocksAt) revert VetoWindowOpen();

        payment.executed = true;
        lockedBalance -= payment.amount;

        (bool success, ) = payment.recipient.call{value: payment.amount}("");
        if (!success) revert TransferFailed();

        emit PaymentExecuted(
            paymentId,
            msg.sender,
            payment.recipient,
            payment.amount,
            block.timestamp
        );
        emit PaymentDecisionLogged(
            paymentId,
            DecisionType.Executed,
            msg.sender,
            payment.agent,
            payment.recipient,
            payment.amount,
            payment.intentHash,
            block.timestamp
        );
    }

    function availableBalance() public view returns (uint256) {
        return address(this).balance - lockedBalance;
    }

    function canExecute(uint256 paymentId) external view returns (bool) {
        if (paymentId >= nextPaymentId) return false;
        PendingPayment memory payment = pendingPayments[paymentId];
        return
            !payment.vetoed &&
            !payment.executed &&
            block.timestamp >= payment.unlocksAt;
    }

    function _getPayment(
        uint256 paymentId
    ) internal view returns (PendingPayment storage payment) {
        if (paymentId >= nextPaymentId) revert PaymentNotFound();
        payment = pendingPayments[paymentId];
    }
}
