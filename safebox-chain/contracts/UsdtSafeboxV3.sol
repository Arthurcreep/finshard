// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

interface IPancakeRouter02 {
    function WETH() external pure returns (address); // на BSC это WBNB

    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);

    function swapExactTokensForETH(
        uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline
    ) external returns (uint[] memory amounts);

    function swapExactTokensForTokens(
        uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline
    ) external returns (uint[] memory amounts);
}

/**
 * UsdtSafeboxV3:
 * - Депозит/вывод USDT (как в V2)
 * - Ручные свопы в BNB/CAKE
 * - АВТО-своп при падении BTC/USD ≥ 0.5% от baseline (baseline фиксируется на deposit и при resetBaseline)
 *   Авто-режим: permissionless performAuto...For(user, slipBps, deadline) — вызывать можно ботом/Automation.
 */
contract UsdtSafeboxV3 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ---- базовые поля V2 ----
    IERC20 public immutable usdt;
    IPancakeRouter02 public immutable router;
    address public immutable WBNB;
    address public immutable CAKE;

    mapping(address => uint256) public balances;

    // ---- авто-своп по BTC ----
    AggregatorV3Interface public immutable btcUsdFeed; // BTC/USD (обычно 8 dec)
    uint16 public constant DROP_BPS = 50; // 0.5% = 50 bps

    struct Baseline {
        int256 price;   // цена BTC/USD (в decimals фида)
        uint64 setAt;   // когда зафиксировали baseline
    }
    mapping(address => Baseline) public userBaseline;

    // ---- события ----
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, address indexed to, uint256 amount);
    event Swapped(address indexed user, address indexed tokenOut, uint256 usdtIn, uint256 amountOut);
    event BaselineSet(address indexed user, int256 price, uint64 at);
    event AutoSwapTriggered(address indexed user, address indexed tokenOut, uint256 usdtIn, uint256 outAmount, int256 base, int256 nowPx, uint64 at);

    constructor(
        address usdtAddress,
        address routerAddress,
        address wbnbAddress,
        address cakeAddress,
        address btcUsdFeedAddress
    ) Ownable() {
        require(usdtAddress != address(0), "USDT=0");
        require(routerAddress != address(0), "ROUTER=0");
        require(wbnbAddress != address(0), "WBNB=0");
        require(cakeAddress != address(0), "CAKE=0");
        require(btcUsdFeedAddress != address(0), "FEED=0");

        usdt = IERC20(usdtAddress);
        router = IPancakeRouter02(routerAddress);
        WBNB = wbnbAddress;
        CAKE = cakeAddress;
        btcUsdFeed = AggregatorV3Interface(btcUsdFeedAddress);
    }

    // ---------- utils ----------
    function _latestBtc() internal view returns (int256 px, uint8 dec) {
        (, int256 answer,, ,) = btcUsdFeed.latestRoundData();
        require(answer > 0, "price<=0");
        dec = btcUsdFeed.decimals();
        return (answer, dec);
    }

    function _calcDropBps(int256 base, int256 nowPx) internal pure returns (uint256) {
        if (base <= 0 || nowPx <= 0) return 0;
        if (nowPx >= base) return 0;
        uint256 diff = uint256(base - nowPx);
        return (diff * 10000) / uint256(base);
    }

    // ---------- базовые операции ----------
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;

        (int256 px,) = _latestBtc();
        userBaseline[msg.sender] = Baseline({ price: px, setAt: uint64(block.timestamp) });
        emit BaselineSet(msg.sender, px, uint64(block.timestamp));
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) public nonReentrant {
        _withdrawTo(amount, msg.sender);
        if (balances[msg.sender] == 0) delete userBaseline[msg.sender];
    }

    function withdrawTo(uint256 amount, address to) external nonReentrant {
        require(to != address(0), "to=0");
        _withdrawTo(amount, to);
        if (balances[msg.sender] == 0) delete userBaseline[msg.sender];
    }

    function _withdrawTo(uint256 amount, address to) internal {
        require(amount > 0, "amount=0");
        uint256 bal = balances[msg.sender];
        require(bal >= amount, "insufficient");
        unchecked { balances[msg.sender] = bal - amount; }
        usdt.safeTransfer(to, amount);
        emit Withdrawn(msg.sender, to, amount);
    }

    function totalUsdt() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    // ---------- превью ----------
    function previewUsdtToBNB(uint256 usdtAmount) external view returns (uint256 outBNB) {
        require(usdtAmount > 0, "amount=0");
        address[] memory path = new address[](2); // [USDT, WBNB]
        path[0] = address(usdt);
        path[1] = WBNB;
        uint[] memory amounts = router.getAmountsOut(usdtAmount, path);
        require(amounts.length >= 2, "bad amounts");
        return amounts[1];
    }

    function previewUsdtToCAKE(uint256 usdtAmount) external view returns (uint256 outCAKE) {
        require(usdtAmount > 0, "amount=0");
        address[] memory path = new address[](3); // [USDT, WBNB, CAKE]
        path[0] = address(usdt);
        path[1] = WBNB;
        path[2] = CAKE;
        uint[] memory amounts = router.getAmountsOut(usdtAmount, path);
        require(amounts.length >= 3, "bad amounts");
        return amounts[2];
    }

    // ---------- ручные свопы ----------
    function swapUsdtToBNB(uint256 usdtAmount, uint256 amountOutMin, uint256 deadline) external nonReentrant {
        require(usdtAmount > 0, "amount=0");
        uint256 bal = balances[msg.sender];
        require(bal >= usdtAmount, "insufficient");
        unchecked { balances[msg.sender] = bal - usdtAmount; }

        usdt.safeApprove(address(router), 0);
        usdt.safeApprove(address(router), usdtAmount);
        address[] memory path = new address[](2); // [USDT, WBNB]
        path[0] = address(usdt);
        path[1] = WBNB;

        uint[] memory amounts = router.swapExactTokensForETH(usdtAmount, amountOutMin, path, msg.sender, deadline);
        require(amounts.length >= 2, "bad amounts");
        emit Swapped(msg.sender, address(0), usdtAmount, amounts[1]);
    }

    function swapUsdtToCAKE(uint256 usdtAmount, uint256 amountOutMin, uint256 deadline) external nonReentrant {
        require(usdtAmount > 0, "amount=0");
        uint256 bal = balances[msg.sender];
        require(bal >= usdtAmount, "insufficient");
        unchecked { balances[msg.sender] = bal - usdtAmount; }

        usdt.safeApprove(address(router), 0);
        usdt.safeApprove(address(router), usdtAmount);
        address[] memory path = new address[](3); // [USDT, WBNB, CAKE]
        path[0] = address(usdt);
        path[1] = WBNB;
        path[2] = CAKE;

        uint[] memory amounts = router.swapExactTokensForTokens(usdtAmount, amountOutMin, path, msg.sender, deadline);
        require(amounts.length >= 3, "bad amounts");
        emit Swapped(msg.sender, CAKE, usdtAmount, amounts[amounts.length - 1]);
    }

    // ---------- авто по падению BTC ----------
    function baselineOf(address user) external view returns (int256 price, uint64 at) {
        Baseline memory b = userBaseline[user];
        return (b.price, b.setAt);
    }

    function shouldTrigger(address user) public view returns (
        bool ready,
        uint256 dropBps,
        int256 basePrice,
        int256 nowPrice,
        uint8 feedDecimals,
        uint256 userVault
    ) {
        Baseline memory b = userBaseline[user];
        basePrice = b.price;
        userVault = balances[user];
        (nowPrice, feedDecimals) = _latestBtc();
        dropBps = _calcDropBps(basePrice, nowPrice);
        ready = (userVault > 0) && (basePrice > 0) && (nowPrice > 0) && (dropBps >= DROP_BPS);
    }

    function resetBaseline() external {
        (int256 px,) = _latestBtc();
        userBaseline[msg.sender] = Baseline({ price: px, setAt: uint64(block.timestamp) });
        emit BaselineSet(msg.sender, px, uint64(block.timestamp));
    }

    /// @notice Permissionless авто в BNB (нативный)
    function performAutoBNBFor(address user, uint16 slipBps, uint256 deadline) external nonReentrant {
        (bool ready,, int256 basePrice, int256 nowPrice,, uint256 vaultUSDT) = shouldTrigger(user);
        require(ready, "not ready");
        require(slipBps <= 1000, "slip too high");
        require(vaultUSDT > 0, "empty");

        unchecked { balances[user] = 0; } // списываем до внешних вызовов

        usdt.safeApprove(address(router), 0);
        usdt.safeApprove(address(router), vaultUSDT);

        address[] memory path = new address[](2); // [USDT, WBNB]
        path[0] = address(usdt);
        path[1] = WBNB;

        uint[] memory q = router.getAmountsOut(vaultUSDT, path);
        uint256 minOut = (q[1] * (10000 - uint256(slipBps))) / 10000;

        uint[] memory amounts = router.swapExactTokensForETH(vaultUSDT, minOut, path, user, deadline);
        require(amounts.length >= 2, "bad amounts");
        emit AutoSwapTriggered(user, address(0), vaultUSDT, amounts[1], basePrice, nowPrice, uint64(block.timestamp));

        delete userBaseline[user];
    }

    /// @notice Permissionless авто в CAKE (токен)
    function performAutoCAKEFor(address user, uint16 slipBps, uint256 deadline) external nonReentrant {
        (bool ready,, int256 basePrice, int256 nowPrice,, uint256 vaultUSDT) = shouldTrigger(user);
        require(ready, "not ready");
        require(slipBps <= 1000, "slip too high");
        require(vaultUSDT > 0, "empty");

        unchecked { balances[user] = 0; }

        usdt.safeApprove(address(router), 0);
        usdt.safeApprove(address(router), vaultUSDT);

        address[] memory path = new address[](3); // [USDT, WBNB, CAKE]
        path[0] = address(usdt);
        path[1] = WBNB;
        path[2] = CAKE;

        uint[] memory q = router.getAmountsOut(vaultUSDT, path);
        uint256 minOut = (q[2] * (10000 - uint256(slipBps))) / 10000;

        uint[] memory amounts = router.swapExactTokensForTokens(vaultUSDT, minOut, path, user, deadline);
        require(amounts.length >= 3, "bad amounts");
        emit AutoSwapTriggered(user, CAKE, vaultUSDT, amounts[amounts.length - 1], basePrice, nowPrice, uint64(block.timestamp));

        delete userBaseline[user];
    }

    receive() external payable {}
}