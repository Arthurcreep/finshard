import { AppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import packageJson from '../package.json' assert { type: 'json' };
export { authConnector } from '@reown/appkit-adapter-wagmi';
export function createAppKit(options) {
    const wagmiAdapter = new WagmiAdapter({
        networks: options.networks,
        projectId: options.projectId
    });
    return new AppKit({
        ...options,
        sdkVersion: `html-wagmi-${packageJson.version}`,
        adapters: [wagmiAdapter]
    });
}
//# sourceMappingURL=index.js.map