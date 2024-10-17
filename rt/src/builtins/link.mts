import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { assertNormalState, assertIsNTuple, assertIsProcessId } from '../Asserts.mjs'
import { __unit } from '../UnitVal.mjs';

export function BuiltinLink<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        link = mkBase((larg) => {
            // $r.$t.raiseCurrentThreadPCToBlockingLev();
            assertNormalState("link");
            this.runtime.$t.raiseCurrentThreadPC(larg.lev);
            assertIsProcessId(larg);
            let tid = larg.val;
            // console.log (arg);
            // assertIsProcessId(larg.val);

            console.log (`Linking ${this.runtime.$t.tid.val} with ${tid}`);
            // if (__nodeManager.isLocalNode(arg[0].val))
            return this.runtime.ret(__unit);
        }, "link");
    }
}
