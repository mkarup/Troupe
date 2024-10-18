import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs';
import { assertNormalState, assertIsNTuple, assertIsProcessId } from '../Asserts.mjs';
import { LVal } from '../Lval.mjs';
import { mkTuple } from '../ValuesUtil.mjs';
import { __unit } from '../UnitVal.mjs';

export function BuiltinLink<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        link = mkBase((larg) => {
            assertNormalState("link");
            this.runtime.$t.raiseCurrentThreadPC(larg.lev);
            assertIsProcessId(larg);

            if (!this.runtime.__sched.isAlive(larg)) {
                console.log (`${larg.val} is not alive`)
            } else {
                let linkeeTid = larg;
                let linkerTid = this.runtime.$t.tid;
                console.log (`Linking ${linkeeTid.val} with ${linkerTid.val}`);
                
                let linkee = this.runtime.__sched.__alive[linkeeTid.val.toString()];
                
                linkee.addLink (linkerTid);
                this.runtime.$t.addLink (linkeeTid);
            }
                
            // if (__nodeManager.isLocalNode(arg[0].val))
            return this.runtime.ret(__unit);
        }, "link")

        trap_exits = mkBase((arg) => {
            assertNormalState("trap_exits");
            this.runtime.$t.trapExitSignals = true;
            return this.runtime.ret(__unit);
        }, "trap_exits")

        exitp = mkBase((larg) => {
            assertNormalState("exitp");
            let arg = larg.val;
            if (Array.isArray(arg)) {
                let toPid = arg[0];
                let fromPid = this.runtime.$t.tid;
                let reason = arg[1] instanceof LVal ? arg[1] : this.runtime.$t.mkVal(arg[1]);
                if (!(reason instanceof Array)) {
                    reason = this.runtime.$t.mkVal (mkTuple ([reason]));
                }
                this.runtime.sendExitSignal (toPid, fromPid, reason, false);
            } else {
            }
            return this.runtime.ret(__unit);
        }, "exitp");
    }
}
