'use strict';
import { v4 as uuidv4} from 'uuid'
import { Thread } from './Thread.mjs';
import runId from './runId.mjs';
import { __unit } from './UnitVal.mjs';
import { mkTuple } from './ValuesUtil.mjs';
import { SchedulerInterface } from './SchedulerInterface.mjs';
import { RuntimeInterface } from './RuntimeInterface.mjs';
import { LVal } from './Lval.mjs'
import {ProcessID, pid_equals} from './process.mjs'
import SandboxStatus from './SandboxStatus.mjs'
import  {ThreadError, TroupeError} from './TroupeError.mjs'
import  { lub, flowsTo } from './options.mjs'
// import * as levels from './options'
import yargs from 'yargs';
const showStack = yargs.argv.showStack
import { mkLogger } from './logger.mjs'
const logger = mkLogger('scheduler');
const info = x => logger.info(x)
const debug = x => logger.debug(x)

const STACKDEPTH = 150;
const KEEP_TERMINATED_MS = 0; // How long to keep context (PC/BL) about dead processes around (0 = don't keep a record)

let TerminationStatus = {
    OK: 0,
    ERR: 1
}

export class Scheduler implements SchedulerInterface {
    rt_uuid: any;
    __funloop: Thread[];
    __blocked: any[];
    __alive: {};
    __recentlyTerminated: {};
    __currentThread: Thread;
    stackcounter: number;
    __unit: any;
    rtObj : RuntimeInterface
    __node: any;
    __stopWhenAllThreadsAreDone: boolean;
    __stopRuntime: () => void;    
    constructor(rtObj:RuntimeInterface) {        
        this.rt_uuid = runId;
        this.rtObj = rtObj
        this.__funloop = new Array()
        this.__blocked = new Array()
        this.__alive = {} // new Set();
        this.__recentlyTerminated = {};
        
        this.__currentThread = null; // current thread object

        this.stackcounter = 0;
                
        // the unit value 
        this.__unit = __unit 
    }


    resetScheduler() {
        // console.log (`The current length of __funloop is ${this.__funloop.length}`)
        // console.log (`The number of active threads is ${Object.keys(this.__alive).length}`)
        for (let x in this.__alive) {            
            if (this.currentThreadId.val.toString() == x) {
                // console.log (x, "ACTIVE")
            } else {
                // console.log (x, "KILLING");
                delete this.__alive[x]
            }
        }
        this.__blocked = []
        this.__funloop = [] 
        // console.log (`The number of active threads is ${Object.keys(this.__alive).length}`)
        // console.log (`The number of blocked threads is ${this.__blocked.length}`)
    }

    __addRecentlyTerminatedThread(t: Thread) {
        if (KEEP_TERMINATED_MS) {
            let death_timestamp = Date.now();

            this.__recentlyTerminated[t.tid.val.toString()] = {pid: t.tid, pc: t.pc, bl: t.bl, death_timestamp: death_timestamp };

            // maybe not a good idea? should this be part of the main loop? (race conditions?)
            setTimeout(() => {
                delete this.__recentlyTerminated[t.tid.val.toString()];
            }, KEEP_TERMINATED_MS);
        }
    }

    done  ()  {            
        this.raiseCurrentThreadPCToBlockingLev(); // Is this necessary?
        this.notifyMonitors(this.__currentThread);
        // console.log (this.__currentThread.processDebuggingName, this.currentThreadId.val.toString(), "done")
        this.__addRecentlyTerminatedThread(this.__currentThread);
        delete this.__alive [this.currentThreadId.val.toString()];              
    }


    halt  (persist=null)  {
        this.raiseCurrentThreadPCToBlockingLev();
        let retVal = new LVal (this.__currentThread.r0_val, 
                               lub(this.__currentThread.bl, this.__currentThread.r0_lev),
                               lub(this.__currentThread.bl, this.__currentThread.r0_tlev))

        this.notifyMonitors (this.__currentThread);
        this.__addRecentlyTerminatedThread(this.__currentThread);

        delete this.__alive[this.currentThreadId.val.toString()];            
        console.log(">>> Main thread finished with value:", retVal.stringRep());
        if (persist) {
            this.rtObj.persist (retVal, persist )
            console.log ("Saved the result value in file", persist)
        }
        return null;
    }

    notifyMonitors(thread: Thread, status = TerminationStatus.OK, errstr = null) {
        let ids = Object.keys (thread.monitors);
        for ( let i = 0; i < ids.length; i ++ ) {
            let id = ids[i];
            let monLev = thread.monitors[id].lev;
            let monPid = thread.monitors[id].pid;
            if (!flowsTo(thread.bl, monLev.val) || !this.isAlive(monPid)) {
                debug(`Thread ${monPid.val.toString()} not notified of thread ${thread.tid.val.toString()}'s termination (terminated with blocking level ${thread.bl.stringRep()}, greater than monitor level ${monLev.val.stringRep()})`);
                continue;
            }

            let toPid =
                thread.mkValWithLev(monPid.val, monLev.val);
            let refUUID =
                thread.mkValWithLev(thread.monitors[id].uuid.val, monLev.val);
            let thisPid = thread.mkValWithLev(thread.tid.val, monLev.val);
            let statusVal = thread.mkValWithLev ( status, monLev.val ) ;
            let reason = TerminationStatus.OK == status ? statusVal :
                thread.mkValWithLev (mkTuple ( [statusVal,  thread.mkValWithLev (errstr, monLev.val)] ), monLev.val);

            let message = thread.mkValWithLev (mkTuple ([ thread.mkVal("DONE"), refUUID, thisPid, reason]), monLev.val)

            let _pc = thread.pc;
            // temporarily raise thread's pc for sending at monitor level
            thread.pc = monLev.val;
            this.rtObj.sendMessageNoChecks ( toPid, message , false) // false flag means no need to return in the process
            // lower it again, if there are more monitors that need to be notified, and they're at a different level
            thread.pc = _pc;
            debug(`Thread ${monPid.val.toString()} notified of thread ${thread.tid.val.toString()}'s termination (terminated with blocking level ${thread.bl.stringRep()}, less than monitor level ${monLev.val.stringRep()})`);            
        }
    }

    raiseCurrentThreadPC (l)  {        
        this.__currentThread.raiseCurrentThreadPC(l);
    }
    
    raiseCurrentThreadPCToBlockingLev () {        
        this.__currentThread.raiseCurrentThreadPCToBlockingLev()
    }


    raiseBlockingThreadLev (l) {   
        this.__currentThread.raiseBlockingThreadLev(l); 
    }


    pinipush (l, cap) {        
        this.__currentThread.pcpinipush(l, cap)        
    }

    pinipop (cap) {
        return this.__currentThread.pinipop(cap); 
    }

    mkVal(x) {        
        return this.__currentThread.mkVal (x);    
    }
    
    mkValPos (x,p) {    
        return this.__currentThread.mkValPos (x,p);    
    }

    mkCopy (x) {
        return this.__currentThread.mkCopy (x);
    }


    initScheduler(node, stopWhenAllThreadsAreDone = false, stopRuntime = () => {}) {        
        this.__node = node;
        this.__stopWhenAllThreadsAreDone = stopWhenAllThreadsAreDone;
        this.__stopRuntime = stopRuntime
    }


    
    get currentThreadId() {
        return this.__currentThread.tid;
    }

    set handlerState (st) {
        this.__currentThread.handlerState = st;        
    }

    get handlerState () {
        return this.__currentThread.handlerState;
    }

    resumeLoopAsync() {
        setImmediate(() => {this.loop()});
    }

    

    scheduleThread(t) {
        this.__funloop.push(t)
    }


    createNewProcessIDAtLevel(pcArg) {
        let pid = uuidv4();
        let pidObj = new ProcessID(this.rt_uuid, pid, this.__node);
        return new LVal(pidObj, pcArg);
    }

    scheduleNewThreadAtLevel (thefun, arg, levpc, levblock, ismain = false, persist=null) {
        let newPid = this.createNewProcessIDAtLevel(levpc);

        let halt = ismain ?  ()=> { this.halt (persist) } : 
                             () => { this.done () };
        
        
        let t = new Thread 
            ( newPid
            , halt
            , thefun
            , arg
            , levpc
            , levblock
            , new SandboxStatus.NORMAL()
            , this.rtObj
            , this );


        this.__alive[newPid.val.toString()] = t;
        this.scheduleThread (t)
        return newPid;
    }

    schedule(thefun, args, nm) {
        this.__currentThread.runNext (thefun, args, nm);
        this.scheduleThread(this.__currentThread)
    }


    blockThread(t) {
        this.__blocked.push(t)
    }


    unblockThread(pid) {        
        for (let i = 0; i < this.__blocked.length; i++) {            
            if (pid_equals(this.__blocked[i].tid, pid)) {
                this.scheduleThread(this.__blocked[i]);
                this.__blocked.splice(i, 1);                
                break;
            }
        }
    }


    isAlive(tid) {
        return (this.__alive[tid.val.toString()] != null);
    }

    getThread (tid) {
        return this.__alive[tid.val.toString()];
    }

    getRecentlyTerminatedThread (tid) {
        return this.__recentlyTerminated[tid.val.toString()];
    }

    stopThreadWithErrorMessage (t:Thread, s:string ) {
        this.notifyMonitors(t, TerminationStatus.ERR, s) ;
        this.__addRecentlyTerminatedThread(t);
        // If thread is currently scheduled
        // (the continuation is queud in the funloop)
        // make sure the continuations are not executed
        // OBS: Seems very hacky... probably a better way to handle this
        t.next = () => { };
        delete this.__alive [t.tid.val.toString()];
    }

    /*****************************************************************************\

    2018-02-18: AA: a hypothesis about memory management in V8

    It appears that V8's memory management is not very well suited for infinitely
    running functions. In other words, functions are expected to eventually
    terminate, and all long-running computations are  expected to run through the
    event loop. This is not surprising given the application where V8 is used.
    This is why we periodically yield to the event loop; this hack appears to let
    GC claim the objects allocated throughout the runtime of this function.  Note
    that without this hack, we are observing memory leaks for many "server"-like
    programs; with the hack, we get a waivy memory consumption profile that reaches
    around 50M on the low points of the wave.

    \*****************************************************************************/


    loop()  {
        const $$LOOPBOUND = 500000;
        let _FUNLOOP = this.__funloop
        let _curThread: Thread; 
        let dest; 
        try {
            for (let $$loopiter = 0; $$loopiter < $$LOOPBOUND && _FUNLOOP.length > 0; $$loopiter ++ ) {
                _curThread = _FUNLOOP.shift();
                this.__currentThread = _curThread;
                dest = _curThread.next 
                let ttl = 1000;  // magic constant; 2021-04-29
                while (dest && ttl -- ) {
                    // if (showStack) { // 2021-04-24; AA; TODO: profile the addition of this conditional in this tight loop
                    //     this.__currentThread.showStack()
                    // }
                    // console.log (">>>>>>>>>>")
                    // console.log (dest.toString())
                    // console.log ("<<<<<<<<<<")
                    // if (dest.debugname ) {
                    //     console.log (" -- ", dest.debugname)
                    // }
                    dest = dest ()
                }

                if (dest) {
                    _curThread.handlerState.checkGuard() 

                    _curThread.next = dest ;
                    _FUNLOOP.push (_curThread);
                }
            }    
        } catch (e) {
            if (e instanceof TroupeError) {
                e.handleError(this);
            } else {
                console.log ("--- Schedule module caught an internal exception ---")
                console.log ("--- The following output may help identify a bug in the runtime ---")
                console.log ("Destination function\n" , dest)
                this.__currentThread.showStack()
                throw e;
            }
        }

        if (_FUNLOOP.length > 0) {
            // we are not really done, but are just hacking around the V8's memory management
            this.resumeLoopAsync();
        }
  
        if (this.__stopWhenAllThreadsAreDone && Object.keys(this.__alive).length == 0 ) {
            this.__stopRuntime();
        }
    }
    
}