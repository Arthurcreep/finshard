// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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
 * UsdtSafeboxV2 (OZ v4): депозит/вывод USDT + своп в BNB/CAKE через Pancake V2.
 * Балансы храним в USDT. При свопе купленный токен отправляется непосредственно пользователю.
 * Дополнительно: своп напрямую из кошелька без депозита.
 */
contract UsdtSafeboxV2 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    IPancakeRouter02 public immutable router;
    address public immutable WBNB;
    address public immutable CAKE;

    mapping(address => uint256) public balances;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, address indexed to, uint256 amount);
    event Swapped(address indexed user, address indexed tokenOut, uint256 usdtIn, uint256 amountOut);

    constructor(
        address usdtAddress,
        address routerAddress,
        address wbnbAddress,
        address cakeAddress
    ) Ownable() {
        require(usdtAddress != address(0), "USDT=0");
        require(routerAddress != address(0), "ROUTER=0");
        require(wbnbAddress != address(0), "WBNB=0");
        require(cakeAddress != address(0), "CAKE=0");
        usdt = IERC20(usdtAddress);
        router = IPancakeRouter02(routerAddress);
        WBNB = wbnbAddress;
        CAKE = cakeAddress;
    }

    // ---------- базовые операции ----------
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        _withdrawTo(amount, msg.sender);
    }

    function withdrawTo(uint256 amount, address to) external nonReentrant {
        require(to != address(0), "to=0");
        _withdrawTo(amount, to);
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

    // ---------- превью (квоты) ----------
    function previewUsdtToBNB(uint256 usdtAmount) external view returns (uint256 outBNB) {
        require(usdtAmount > 0, "amount=0");
        address[] memory path = new address[](2); // [USDT, WBNB]
        path[0] = address(usdt);
        path[1] = WBNB;
        uint[] memory amounts = router.getAmountsOut(usdtAmount, path);
        require(amounts.length >= 2, "invalid amounts length");
        return amounts[1];
    }

    function previewUsdtToCAKE(uint256 usdtAmount) external view returns (uint256 outCAKE) {
        require(usdtAmount > 0, "amount=0");
        address[] memory path = new address[](3); // [USDT, WBNB, CAKE]
        path[0] = address(usdt);
        path[1] = WBNB;
        path[2] = CAKE;
        uint[] memory amounts = router.getAmountsOut(usdtAmount, path);
        require(amounts.length >= 3, "invalid amounts length");
        return amounts[2];
    }

    // ---------- свопы: из ВНУТРЕННЕГО баланса ----------
    function swapUsdtToBNB(
        uint256 usdtAmount,
        uint256 amountOutMin,
        uint256 deadline
    ) external nonReentrant {
        require(usdtAmount > 0, "amount=0");
        uint256 bal = balances[msg.sender];
        require(bal >= usdtAmount, "insufficient");

        unchecked { balances[msg.sender] = bal - usdtAmount; }

        usdt.safeApprove(address(router), 0);
        usdt.safeApprove(address(router), usdtAmount);

        address[] memory path = new address[](2); // [USDT, WBNB]
        path[0] = address(usdt);
        path[1] = WBNB;

        uint[] memory amounts = router.swapExactTokensForETH(
            usdtAmount, amountOutMin, path, msg.sender, deadline
        );

        emit Swapped(msg.sender, address(0), usdtAmount, amounts[1]); // BNB
    }

    function swapUsdtToCAKE(
        uint256 usdtAmount,
        uint256 amountOutMin,
        uint256 deadline
    ) external nonReentrant {
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

        uint[] memory amounts = router.swapExactTokensForTokens(
            usdtAmount, amountOutMin, path, msg.sender, deadline
        );

        emit Swapped(msg.sender, CAKE, usdtAmount, amounts[amounts.length - 1]);
    }

    // ---------- свопы: НАПРЯМУЮ ИЗ КОШЕЛЬКА ----------
    function swapFromWalletToBNB(
        uint256 usdtAmount,
        uint256 amountOutMin,
        uint256 deadline
    ) external nonReentrant {
        require(usdtAmount > 0, "amount=0");

        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);
        usdt.safeApprove(address(router), 0);
        usdt.safeApprove(address(router), usdtAmount);

        address[] memory path = new address[](2); // [USDT, WBNB]
        path[0] = address(usdt);
        path[1] = WBNB;

        uint[] memory amounts = router.swapExactTokensForETH(
            usdtAmount, amountOutMin, path, msg.sender, deadline
        );

        emit Swapped(msg.sender, address(0), usdtAmount, amounts[1]);
    }

    function swapFromWalletToCAKE(
        uint256 usdtAmount,
        uint256 amountOutMin,
        uint256 deadline
    ) external nonReentrant {
        require(usdtAmount > 0, "amount=0");

        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);
        usdt.safeApprove(address(router), 0);
        usdt.safeApprove(address(router), usdtAmount);

        address[] memory path = new address[](3); // [USDT, WBNB, CAKE]
        path[0] = address(usdt);
        path[1] = WBNB;
        path[2] = CAKE;

        uint[] memory amounts = router.swapExactTokensForTokens(
            usdtAmount, amountOutMin, path, msg.sender, deadline
        );

        emit Swapped(msg.sender, CAKE, usdtAmount, amounts[amounts.length - 1]);
    }

    /// @notice аварийный вывод любых токенов КРОМЕ USDT (только владелец)
    function sweep(address token, address to) external onlyOwner nonReentrant {
        require(to != address(0), "to=0");
        require(token != address(usdt), "no sweep USDT");
        uint256 bal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, bal);
    }

    receive() external payable {}
}