import { masterApi, type CreateMasterPayload, type FisTarget } from '../api/masterApi.ts';

// Resolve structures before any write; migration keeps the source snapshot across servers.
export async function createMasterWithStructure(payload: CreateMasterPayload & { oldFis?: FisTarget }) {
    const { oldFis, ...request } = payload;
    if (request.forceUpdate && oldFis && oldFis !== request.fis) {
        const source = await masterApi.inspectMasterStructure(request.unit, request.process, oldFis);
        if (source.masterFis !== oldFis || (!source.exists && /SMT|XRAY|ICT/i.test(request.process))) throw new Error('Brak mastera na źródłowym FIS.');
        const migration = { ...request, sourceFis: oldFis, sourceStructure: source };
        const preview = await masterApi.createMaster({ ...migration, previewOnly: true });
        if (!preview.data?.structure) throw new Error('Brak struktury docelowej; migracja przerwana.');
        let sourceDeleted = false;
        try {
            if (source.exists) {
                await masterApi.deleteMasterStructure(source, request.process, oldFis);
                sourceDeleted = true;
            }
            return await masterApi.createMaster({ ...migration, expectedTargetStructure: preview.data.structure });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            const state = !source.exists ? 'Sztuka była nieobecna w WIP' : sourceDeleted ? 'Usunięto strukturę' : 'Usuwanie mogło częściowo zmienić strukturę';
            throw new Error(`${state} ${source.unit} na ${oldFis}; zapis na ${request.fis} nie został potwierdzony. Sprawdź oba FIS przed ponowieniem. ${detail}`);
        }
    }
    // A child may exist only on the other FIS while its panel is registered in masterUnits.
    const target = await masterApi.inspectMasterStructure(request.unit, request.process, request.fis);
    if (!target.exists && ((target.masterFis && target.masterFis !== request.fis) || /SMT|XRAY|ICT/i.test(request.process))) {
        const otherFis: FisTarget = request.fis === 'FIS1' ? 'FIS2' : 'FIS1';
        const source = await masterApi.inspectMasterStructure(request.unit, request.process, otherFis);
        if (source.exists && source.masterFis === otherFis) {
            return masterApi.createMaster({ ...request, sourceFis: otherFis, sourceStructure: source });
        }
    }
    return masterApi.createMaster(request);
}
