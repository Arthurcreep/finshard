// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

interface IPancakeRouter02 {
    function WETH() external pure returns (address); // на BSC это WBNB

    function getAmountsOut(
        uint amountIn,
        address[] calldata path
    ) external view returns (uint[] memory amounts);

    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);
}

contract UsdtSafeboxV4_BNBOnly_Updated is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ---- базовые поля ----
    IERC20 public immutable usdt;
    IPancakeRouter02 public immutable router;
    address public immutable WBNB;

    mapping(address => uint256) public balances; // USDT баланс
    mapping(address => uint256) public bnbBalances; // BNB баланс

    // ---- авто-своп по BTC ----
    AggregatorV3Interface public immutable btcUsdFeed; // BTC/USD (обычно 8 dec)
    uint16 public constant DROP_BPS = 50; // 0.5% = 50 bps
    uint16 public constant RISE_BPS = 50; // 0.5% = 50 bps для отскока
    uint256 public constant COOLDOWN = 1 hours; // Кулдаун 1 час

    struct Baseline {
        int256 price; // цена BTC/USD на депозит
        uint64 setAt; // когда зафиксировали baseline
        int256 reboundPrice; // цена BTC/USD после свопа
        uint64 reboundAt; // когда зафиксировали rebound
    }
    mapping(address => Baseline) public userBaseline;

    // ---- события ----
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, address indexed to, uint256 amount);
    event Swapped(
        address indexed user,
        address indexed tokenOut,
        uint256 usdtIn,
        uint256 amountOut
    );
    event BaselineSet(address indexed user, int256 price, uint64 at);
    event AutoSwapTriggered(
        address indexed user,
        address indexed tokenOut,
        uint256 usdtIn,
        uint256 outAmount,
        int256 base,
        int256 nowPx,
        uint64 at
    );
    event ReboundSwapTriggered(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 usdtOut,
        int256 reboundBase,
        int256 nowPx,
        uint64 at
    );

    constructor(
        address usdtAddress,
        address routerAddress,
        address wbnbAddress,
        address btcUsdFeedAddress
    ) Ownable() {
        require(usdtAddress != address(0), "USDT=0");
        require(routerAddress != address(0), "ROUTER=0");
        require(wbnbAddress != address(0), "WBNB=0");
        require(btcUsdFeedAddress != address(0), "FEED=0");

        usdt = IERC20(usdtAddress);
        router = IPancakeRouter02(routerAddress);
        WBNB = wbnbAddress;
        btcUsdFeed = AggregatorV3Interface(btcUsdFeedAddress);
    }

    // ---------- utils ----------
    function _latestBtc() internal view returns (int256 px, uint8 dec) {
        (, int256 answer, , , ) = btcUsdFeed.latestRoundData();
        require(answer > 0, "price<=0");
        dec = btcUsdFeed.decimals();
        return (answer, dec);
    }

    function _calcDropBps(
        int256 base,
        int256 nowPx
    ) internal pure returns (uint256) {
        if (base <= 0 || nowPx <= 0) return 0;
        if (nowPx >= base) return 0;
        uint256 diff = uint256(base - nowPx);
        return (diff * 10000) / uint256(base);
    }

    function _calcRiseBps(
        int256 base,
        int256 nowPx
    ) internal pure returns (uint256) {
        if (base <= 0 || nowPx <= 0) return 0;
        if (nowPx <= base) return 0;
        uint256 diff = uint256(nowPx - base);
        return (diff * 10000) / uint256(base);
    }

    // ---------- базовые операции ----------
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;

        (int256 px, ) = _latestBtc();
        userBaseline[msg.sender] = Baseline({
            price: px,
            setAt: uint64(block.timestamp),
            reboundPrice: 0,
            reboundAt: 0
        });
        emit BaselineSet(msg.sender, px, uint64(block.timestamp));
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) public nonReentrant {
        _withdrawTo(amount, msg.sender);
        if (balances[msg.sender] == 0 && bnbBalances[msg.sender] == 0) {
            delete userBaseline[msg.sender];
        }
    }

    function withdrawTo(uint256 amount, address to) external nonReentrant {
        require(to != address(0), "to=0");
        _withdrawTo(amount, to);
        if (balances[msg.sender] == 0 && bnbBalances[msg.sender] == 0) {
            delete userBaseline[msg.sender];
        }
    }

    function _withdrawTo(uint256 amount, address to) internal {
        require(amount > 0, "amount=0");
        uint256 bal = balances[msg.sender];
        require(bal >= amount, "insufficient");
        unchecked {
            balances[msg.sender] = bal - amount;
        }
        usdt.safeTransfer(to, amount);
        emit Withdrawn(msg.sender, to, amount);
    }

    function totalUsdt() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    // ---------- превью ----------
    function previewUsdtToBNB(
        uint256 usdtAmount
    ) external view returns (uint256 outBNB) {
        require(usdtAmount > 0, "amount=0");
        address[] memory path = new address[](2); // [USDT, WBNB]
        path[0] = address(usdt);
        path[1] = WBNB;
        uint[] memory amounts = router.getAmountsOut(usdtAmount, path);
        require(amounts.length >= 2, "bad amounts");
        return amounts[1];
    }

    function previewBNBToUSDT(
        uint256 bnbAmount
    ) external view returns (uint256 outUSDT) {
        require(bnbAmount > 0, "amount=0");
        address[] memory path = new address[](2); // [WBNB, USDT]
        path[0] = WBNB;
        path[1] = address(usdt);
        uint[] memory amounts = router.getAmountsOut(bnbAmount, path);
        require(amounts.length >= 2, "bad amounts");
        return amounts[1];
    }

    // ---------- ручные свопы ----------
    function swapUsdtToBNB(
        uint256 usdtAmount,
        uint256 amountOutMin,
        uint256 deadline
    ) external nonReentrant {
        require(usdtAmount > 0, "amount=0");
        uint256 bal = balances[msg.sender];
        require(bal >= usdtAmount, "insufficient");
        unchecked {
            balances[msg.sender] = bal - usdtAmount;
        }

        usdt.safeApprove(address(router), 0);
        usdt.safeApprove(address(router), usdtAmount);
        address[] memory path = new address[](2); // [USDT, WBNB]
        path[0] = address(usdt);
        path[1] = WBNB;

        uint[] memory amounts = router.swapExactTokensForETH(
            usdtAmount,
            amountOutMin,
            path,
            msg.sender,
            deadline
        );
        require(amounts.length >= 2, "bad amounts");
        emit Swapped(msg.sender, address(0), usdtAmount, amounts[1]);
    }

    // ---------- авто по падению BTC ----------
    function baselineOf(
        address user
    )
        external
        view
        returns (int256 price, uint64 at, int256 reboundPrice, uint64 reboundAt)
    {
        Baseline memory b = userBaseline[user];
        return (b.price, b.setAt, b.reboundPrice, b.reboundAt);
    }

    function shouldTrigger(
        address user
    )
        public
        view
        returns (
            bool ready,
            uint256 dropBps,
            int256 basePrice,
            int256 nowPrice,
            uint8 feedDecimals,
            uint256 userVault
        )
    {
        Baseline memory b = userBaseline[user];
        basePrice = b.price;
        userVault = balances[user];
        (nowPrice, feedDecimals) = _latestBtc();
        dropBps = _calcDropBps(basePrice, nowPrice);
        ready =
            (userVault > 0) &&
            (basePrice > 0) &&
            (nowPrice > 0) &&
            (dropBps >= DROP_BPS);
    }

    function resetBaseline() external {
        (int256 px, ) = _latestBtc();
        userBaseline[msg.sender] = Baseline({
            price: px,
            setAt: uint64(block.timestamp),
            reboundPrice: 0,
            reboundAt: 0
        });
        emit BaselineSet(msg.sender, px, uint64(block.timestamp));
    }

    function performAutoBNBFor(
        address user,
        uint16 slipBps,
        uint256 deadline
    ) external nonReentrant {
        (
            bool ready,
            ,
            int256 basePrice,
            int256 nowPrice,
            ,
            uint256 vaultUSDT
        ) = shouldTrigger(user);
        require(ready, "not ready");
        require(slipBps <= 100, "slip too high"); // Уменьшен до 1%
        require(vaultUSDT > 0, "empty");

        unchecked {
            balances[user] = 0;
        }

        usdt.safeApprove(address(router), 0);
        usdt.safeApprove(address(router), vaultUSDT);

        address[] memory path = new address[](2); // [USDT, WBNB]
        path[0] = address(usdt);
        path[1] = WBNB;

        uint[] memory q = router.getAmountsOut(vaultUSDT, path);
        uint256 minOut = (q[1] * (10000 - uint256(slipBps))) / 10000;

        uint[] memory amounts = router.swapExactTokensForETH(
            vaultUSDT,
            minOut,
            path,
            address(this),
            deadline
        );
        require(amounts.length >= 2, "bad amounts");
        bnbBalances[user] += amounts[1];

        (int256 newPx, ) = _latestBtc();
        userBaseline[user].reboundPrice = newPx;
        userBaseline[user].reboundAt = uint64(block.timestamp);

        emit AutoSwapTriggered(
            user,
            address(0),
            vaultUSDT,
            amounts[1],
            basePrice,
            nowPrice,
            uint64(block.timestamp)
        );
    }

    // ---------- авто по отскоку BTC ----------
    function shouldTriggerRebound(
        address user
    )
        public
        view
        returns (
            bool ready,
            uint256 riseBps,
            int256 reboundBasePrice,
            int256 nowPrice,
            uint8 feedDecimals,
            uint256 bnbVault
        )
    {
        Baseline memory b = userBaseline[user];
        reboundBasePrice = b.reboundPrice;
        bnbVault = bnbBalances[user];
        (nowPrice, feedDecimals) = _latestBtc();
        riseBps = _calcRiseBps(reboundBasePrice, nowPrice);
        ready =
            (reboundBasePrice > 0) &&
            (nowPrice > 0) &&
            (riseBps >= RISE_BPS) &&
            (bnbVault > 0) &&
            (block.timestamp >= b.reboundAt + COOLDOWN); // Добавлен кулдаун
    }

    function performReboundToUSDTFor(
        address user,
        uint16 slipBps,
        uint256 deadline
    ) external nonReentrant {
        (
            bool ready,
            ,
            int256 reboundBasePrice,
            int256 nowPrice,
            ,
            uint256 bnbVault
        ) = shouldTriggerRebound(user);
        require(ready, "not ready");
        require(slipBps <= 100, "slip too high"); // Уменьшен до 1%
        require(bnbVault > 0, "empty BNB");

        unchecked {
            bnbBalances[user] = 0;
        }

        address[] memory path = new address[](2); // [WBNB, USDT]
        path[0] = WBNB;
        path[1] = address(usdt);
        uint[] memory q = router.getAmountsOut(bnbVault, path);
        uint256 minOut = (q[1] * (10000 - uint256(slipBps))) / 10000;

        uint[] memory amounts = router.swapExactETHForTokens{value: bnbVault}(
            minOut,
            path,
            address(this),
            deadline
        );
        require(amounts.length >= 2, "bad amounts");
        balances[user] += amounts[1];

        emit ReboundSwapTriggered(
            user,
            WBNB,
            bnbVault,
            amounts[1],
            reboundBasePrice,
            nowPrice,
            uint64(block.timestamp)
        );

        // Обновляем baseline для следующего цикла вместо удаления
        (int256 newPx, ) = _latestBtc();
        userBaseline[user].price = newPx;
        userBaseline[user].setAt = uint64(block.timestamp);
        userBaseline[user].reboundPrice = 0;
        userBaseline[user].reboundAt = 0;
        emit BaselineSet(user, newPx, uint64(block.timestamp));
    }

    receive() external payable {}
}
