import {UserRuntimeZero, Constructor, mkBase, mkService} from './UserRuntimeZero.mjs'
import { assertNormalState, assertIsProcessId, assertIsString, assertIsLevel, assertIsNTuple } from '../Asserts.mjs'
import { __unit } from '../UnitVal.mjs';
import { SchedulerInterface } from '../SchedulerInterface.mjs';
import { Thread } from '../Thread.mjs';
import { lub, flowsTo } from  '../options.mjs';
import yargs from 'yargs';
import { mkLogger } from '../logger.mjs'
import { __nodeManager } from '../NodeManager.mjs'
import { LVal } from '../Lval.mjs'
import { mkTuple } from '../ValuesUtil.mjs'
const logLevel = yargs.argv.debug ? 'debug': 'info'
const logger = mkLogger('monitor', logLevel);
const debug = x => logger.debug(x)

export function BuiltinMonitors <TBase extends Constructor<UserRuntimeZero>> (Base:TBase) {

    return class extends Base {
        monitorlocal = mkBase((arg) => {
            assertNormalState("monitorlocal");
            let $r = this.runtime;
            $r.$t.raiseCurrentThreadPCToBlockingLev();

            assertIsNTuple(arg, 2);
            assertIsProcessId(arg.val[0]);
            assertIsLevel(arg.val[1]);

            let tid = arg.val[0];
            let monlvl = arg.val[1];

            // monitor level must be at least as restrictive as current pc
            let monitor_level_high_enough = flowsTo($r.$t.pc, monlvl.val);

            if (!monitor_level_high_enough) {
                let errorMessage =
                    "PC level is too sensitive to monitor at supplied level upper bound\n" +
                        ` | supplied monitor level: ${monlvl.val.stringRep()}\n` +
                        ` | pc level: ${$r.$t.pc.stringRep()}\n`;
                $r.$t.threadError (errorMessage);
            }

            // 1. Raise PC to at least monitor level + level of argument
            $r.$t.raiseCurrentThreadPC(lub(tid.lev, monlvl.lev, monlvl.val));

            // 2. Find (local) thread to monitor
            let t = $r.__sched.getThread(tid);

            // 3. Make unique monitor reference
            let r = $r.rt_mkuuid();

            // 4. Check if thread is alive
            if (t) {
                // If thread is alive, add the caller thread to the list of monitors
                debug(`Thread ${$r.$t.tid.val.toString()} is (locally) monitoring thread ${tid.val.toString()} at level ${monlvl.stringRep()}`);

                t.addMonitor($r.$t.tid, r, monlvl);
            } // if not, check if thread recently died
            else {
                let death_info = $r.__sched.getRecentlyTerminatedThread(tid);
                if (death_info) {
                    debug(`Thread ${$r.$t.tid.val.toString()} wants to monitor recently terminated thread ${tid.val.toString()} at level ${monlvl.stringRep()}`);

                    // Check if termination occured in a context that allows notifying the monitor
                    if (flowsTo(death_info.bl, monlvl.val)) {
                        debug(`Thread ${$r.$t.tid.val.toString()} notified of thread ${tid.val.toString()}'s termination retroactively (terminated with blocking level ${death_info.bl.stringRep()}, less than monitor level ${monlvl.val.stringRep()})`);

                        let mkVal = (v) => new LVal(v, monlvl.val);

                        let ref =  mkVal(r.val);
                        let from = mkVal(tid.val);
                        let to = mkVal($r.$t.tid.val);
                        let status = mkVal(1);
                        let err = mkVal("noproc"); // mimicking Erlang
                        let reason = mkVal(mkTuple([status, err]));
                        let message = mkVal(mkTuple([mkVal("DONE"), ref, from, reason]));

                        let nodeId = mkVal(__nodeManager.getNodeId());
                        $r.__mbox.addMessage(nodeId, to, message, monlvl.val);
                    } else {
                        debug(`Thread ${$r.$t.tid.val.toString()} not notified of thread ${tid.val.toString()}'s termination retroactively (terminated with blocking level ${death_info.bl.stringRep()}, greater than monitor level ${monlvl.val.stringRep()})`);
                    }
                } else {
                    debug(`Thread ${$r.$t.tid.val.toString()} wants to monitor terminated/unknown process ${tid.val.toString()}, but there is not enough information to safely disclose non-existence`);
                }
            }

            // Return monitor reference
            return $r.$t.returnImmediateLValue(r);
        })


        demonitorlocal = mkBase((arg) => {
            assertIsString(arg);
            // mutates state; so we should be careful...
            return this.runtime.ret(__unit);
        })

        // Service level function
        monitor = mkService(() => {
            assertNormalState("monitor");
            return this.runtime.$service.monitor();
        }, "monitor")
    }
}