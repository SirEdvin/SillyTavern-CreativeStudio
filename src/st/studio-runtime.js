// Shared persistence/store, initialized without mounting or navigating the Studio UI.
import { createEnvironment, stContext } from './env.js';
import { createStore } from '../ui/store.js';
import { createProject } from '../core/project.js';
import { attachSettingsBackup } from './studio-settings.js';
import { initNanoKeyStore } from './nano-key-store.js';
let initializing=null;
export function withDefaultCreationModel(project) {
    const ctx=stContext(),id=ctx.extensionSettings?.creativeStudio?.defaultCreationProfileId;
    return id&&ctx.extensionSettings?.connectionManager?.profiles?.some(p=>p.id===id)
        ? {...project,settings:{...project.settings,creationProfileId:id}} : project;
}
export function getStudioRuntime() {
    initializing??=(async()=>{
        const env=await createEnvironment();
        const restored=await attachSettingsBackup(stContext(),env.storage).catch(()=>[]);
        await initNanoKeyStore(stContext()).catch(()=>{});
        const last=await env.storage.loadLastProject().catch(()=>null);
        const store=createStore(last??withDefaultCreationModel(createProject('My first project')),{sticky:['generationRuns','workspace']});
        env.attachStore(store);
        return {env,store,restored};
    })().catch(error=>{initializing=null;throw error});
    return initializing;
}
