import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { engineerApi } from '../api/engineerApi';

interface EngineerActionCallbacks {
    onMutate: () => void;
    onError: (error: unknown) => void;
    onProcessUpdated: () => void;
    onProcessAdded: () => void;
    onProcessDeleted: () => void;
    onMailAdded: () => void;
    onMailUpdated: () => void;
    onMailDeleted: () => void;
}

export const useEngineersQuery = () => useQuery({
    queryKey: ['engineers'],
    queryFn: () => engineerApi.getEngineers(),
});

export const useMailsQuery = () => useQuery({
    queryKey: ['mails'],
    queryFn: () => engineerApi.getMails(),
});

export const useEngineerActions = (callbacks: EngineerActionCallbacks) => {
    const queryClient = useQueryClient();
    const refreshEngineers = () => queryClient.invalidateQueries({ queryKey: ['engineers'] });
    const refreshMails = () => queryClient.invalidateQueries({ queryKey: ['mails'] });
    const common = { onMutate: callbacks.onMutate, onError: callbacks.onError };

    const updateProcessMutation = useMutation({
        mutationFn: ({ process, mail }: { process: string; mail: string }) => engineerApi.updateEngineerMail(process, mail),
        ...common,
        onSuccess: async () => {
            await refreshEngineers();
            callbacks.onProcessUpdated();
        },
    });
    const addProcessMutation = useMutation({
        mutationFn: ({ process, mail }: { process: string; mail: string }) => engineerApi.addEngineer(process, mail),
        ...common,
        onSuccess: async () => {
            await refreshEngineers();
            callbacks.onProcessAdded();
        },
    });
    const deleteProcessMutation = useMutation({
        mutationFn: (id: number) => engineerApi.deleteEngineer(id),
        ...common,
        onSuccess: async () => {
            await refreshEngineers();
            callbacks.onProcessDeleted();
        },
    });
    const addMailMutation = useMutation({
        mutationFn: ({ name, mail }: { name: string; mail: string }) => engineerApi.addMail(name, mail),
        ...common,
        onSuccess: async () => {
            await refreshMails();
            callbacks.onMailAdded();
        },
    });
    const updateMailMutation = useMutation({
        mutationFn: ({ id, name, mail }: { id: number; name: string; mail: string }) => engineerApi.updateMail(id, name, mail),
        ...common,
        onSuccess: async () => {
            await refreshMails();
            callbacks.onMailUpdated();
        },
    });
    const deleteMailMutation = useMutation({
        mutationFn: (id: number) => engineerApi.deleteMail(id),
        ...common,
        onSuccess: async () => {
            await refreshMails();
            callbacks.onMailDeleted();
        },
    });

    return {
        updateProcessMutation,
        addProcessMutation,
        deleteProcessMutation,
        addMailMutation,
        updateMailMutation,
        deleteMailMutation,
    };
};
