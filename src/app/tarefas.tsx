import React, { useEffect, useState } from 'react';

import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView, // ALTERAÇÃO: permite visualizar todo o formulário
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    where,
    Timestamp,
} from 'firebase/firestore';

import {
    onAuthStateChanged,
    signOut,
} from 'firebase/auth';

import { auth, db } from '../firebaseConfig';
import { useRouter } from 'expo-router';

// ============================================================
// TIPOS
// ============================================================

type Prioridade = 'Alta' | 'Média' | 'Baixa';

interface Tarefa {
    id: string;
    uid: string;
    titulo: string;
    descricao: string;
    concluida: boolean;
    prioridade?: Prioridade;
    dataVencimento?: string;
    criadoEm?: Timestamp;
    atualizadoEm?: Timestamp;
}

type Filtro = 'Todas' | 'Pendentes' | 'Atrasadas' | 'Concluídas';

// ============================================================
// MÁSCARA E VALIDAÇÃO DA DATA
// ============================================================

// ALTERAÇÃO: insere automaticamente as barras da data.
function aplicarMascaraData(valor: string): string {
    const numeros = valor.replace(/\D/g, '').slice(0, 8);

    if (numeros.length <= 2) {
        return numeros;
    }

    if (numeros.length <= 4) {
        return `${numeros.slice(0, 2)}/${numeros.slice(2)}`;
    }

    return `${numeros.slice(0, 2)}/${numeros.slice(2, 4)}/${numeros.slice(4)}`;
}

// ALTERAÇÃO: verifica o formato e a existência da data.
function dataValida(valor: string): boolean {
    const partes = valor.match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/
    );

    if (!partes) {
        return false;
    }

    const dia = Number(partes[1]);
    const mes = Number(partes[2]);
    const ano = Number(partes[3]);

    const data = new Date(ano, mes - 1, dia);

    return (
        data.getFullYear() === ano &&
        data.getMonth() === mes - 1 &&
        data.getDate() === dia
    );
}

// ============================================================
// PRIORIDADE E TAREFAS ATRASADAS
// ============================================================

const PRIORIDADES: Prioridade[] = ['Alta', 'Média', 'Baixa'];

const PESO_PRIORIDADE: Record<Prioridade, number> = {
    'Alta': 0,
    'Média': 1,
    'Baixa': 2,
};

// Tarefas criadas antes deste campo existir contam como "Média".
function prioridadeDe(tarefa: Tarefa): Prioridade {
    return tarefa.prioridade ?? 'Média';
}

// Converte "DD/MM/AAAA" em Date (meia-noite). Retorna null se vazio ou inválido.
function converterData(valor?: string): Date | null {
    if (!valor || !dataValida(valor)) {
        return null;
    }

    const [dia, mes, ano] = valor.split('/').map(Number);

    return new Date(ano, mes - 1, dia);
}

function inicioDeHoje(): Date {
    const agora = new Date();

    return new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate()
    );
}

// Quantos dias a tarefa está atrasada (0 se não está atrasada).
function diasDeAtraso(tarefa: Tarefa): number {
    if (tarefa.concluida) {
        return 0;
    }

    const vencimento = converterData(tarefa.dataVencimento);

    if (!vencimento) {
        return 0;
    }

    const diferenca =
        inicioDeHoje().getTime() - vencimento.getTime();

    return diferenca > 0
        ? Math.round(diferenca / 86400000)
        : 0;
}

function estaAtrasada(tarefa: Tarefa): boolean {
    return diasDeAtraso(tarefa) > 0;
}

function venceHoje(tarefa: Tarefa): boolean {
    if (tarefa.concluida) {
        return false;
    }

    const vencimento = converterData(tarefa.dataVencimento);

    return (
        vencimento !== null &&
        vencimento.getTime() === inicioDeHoje().getTime()
    );
}

// Ordem da lista: pendentes antes das concluídas; entre as pendentes,
// atrasadas primeiro, depois prioridade, depois data de vencimento.
function compararTarefas(a: Tarefa, b: Tarefa): number {
    const criadaA = a.criadoEm?.toMillis() ?? 0;
    const criadaB = b.criadoEm?.toMillis() ?? 0;

    if (a.concluida !== b.concluida) {
        return a.concluida ? 1 : -1;
    }

    if (a.concluida && b.concluida) {
        return criadaB - criadaA;
    }

    const atrasoA = estaAtrasada(a) ? 0 : 1;
    const atrasoB = estaAtrasada(b) ? 0 : 1;

    if (atrasoA !== atrasoB) {
        return atrasoA - atrasoB;
    }

    const pesoA = PESO_PRIORIDADE[prioridadeDe(a)];
    const pesoB = PESO_PRIORIDADE[prioridadeDe(b)];

    if (pesoA !== pesoB) {
        return pesoA - pesoB;
    }

    const dataA = converterData(a.dataVencimento)?.getTime();
    const dataB = converterData(b.dataVencimento)?.getTime();

    if (dataA !== undefined && dataB !== undefined && dataA !== dataB) {
        return dataA - dataB;
    }

    if (dataA !== undefined && dataB === undefined) {
        return -1;
    }

    if (dataA === undefined && dataB !== undefined) {
        return 1;
    }

    return criadaB - criadaA;
}

// ============================================================
// TELA DE TAREFAS
// ============================================================

export default function Tarefas() {
    const router = useRouter();

    // ==========================================================
    // ESTADOS
    // ==========================================================

    const [tarefas, setTarefas] = useState<Tarefa[]>([]);
    const [usuarioUid, setUsuarioUid] = useState<string | null>(null);

    const [verificandoSessao, setVerificandoSessao] = useState(true);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [excluindo, setExcluindo] = useState(false);

    const [erroCarregamento, setErroCarregamento] = useState('');
    const [feedback, setFeedback] = useState('');
    const [feedbackErro, setFeedbackErro] = useState(false);

    const [busca, setBusca] = useState('');
    const [filtro, setFiltro] = useState<Filtro>('Todas');

    const [modalFormulario, setModalFormulario] = useState(false);

    // ALTERAÇÃO: modal próprio para confirmar a exclusão.
    const [tarefaParaExcluir, setTarefaParaExcluir] =
        useState<Tarefa | null>(null);

    const [tarefaEditando, setTarefaEditando] =
        useState<Tarefa | null>(null);

    const [titulo, setTitulo] = useState('');
    const [descricao, setDescricao] = useState('');
    const [dataVencimento, setDataVencimento] = useState('');
    const [prioridade, setPrioridade] = useState<Prioridade>('Média');

    // ==========================================================
    // FEEDBACK
    // ==========================================================

    const mostrarFeedback = (
        mensagem: string,
        erro = false
    ) => {
        setFeedback(mensagem);
        setFeedbackErro(erro);
    };

    // ==========================================================
    // AUTENTICAÇÃO
    // ==========================================================

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (usuario) => {
            if (usuario) {
                setUsuarioUid(usuario.uid);
            } else {
                setUsuarioUid(null);
                router.replace('/');
            }

            setVerificandoSessao(false);
        });

        return unsubscribe;
    }, [router]);

    // ==========================================================
    // LEITURA EM TEMPO REAL
    // ==========================================================

    useEffect(() => {
        if (!usuarioUid) {
            return;
        }

        setCarregando(true);
        setErroCarregamento('');

        // Cada usuário consulta somente as tarefas associadas ao UID.
        const consulta = query(
            collection(db, 'tarefas'),
            where('uid', '==', usuarioUid)
        );

        const unsubscribe = onSnapshot(
            consulta,
            (snapshot) => {
                const lista = snapshot.docs.map((documento) => ({
                    id: documento.id,
                    ...documento.data(),
                } as Tarefa));

                lista.sort((a, b) => {
                    const dataA = a.criadoEm?.toMillis() ?? 0;
                    const dataB = b.criadoEm?.toMillis() ?? 0;

                    return dataB - dataA;
                });

                setTarefas(lista);
                setCarregando(false);
                setErroCarregamento('');
            },
            (error) => {
                console.error('Erro ao carregar tarefas:', error);

                setErroCarregamento(
                    'Não foi possível carregar as tarefas. Verifique as permissões do Firestore.'
                );

                setCarregando(false);
            }
        );

        return unsubscribe;
    }, [usuarioUid]);

    // ==========================================================
    // NOVA TAREFA
    // ==========================================================

    const abrirNovaTarefa = () => {
        setTarefaEditando(null);
        setTitulo('');
        setDescricao('');
        setDataVencimento('');
        setPrioridade('Média');
        setModalFormulario(true);
        setFeedback('');
    };

    // ==========================================================
    // EDITAR TAREFA
    // ==========================================================

    const abrirEdicao = (tarefa: Tarefa) => {
        setTarefaEditando(tarefa);
        setTitulo(tarefa.titulo);
        setDescricao(tarefa.descricao);

        // ALTERAÇÃO: recupera também a data para edição.
        setDataVencimento(tarefa.dataVencimento || '');
        setPrioridade(prioridadeDe(tarefa));

        setModalFormulario(true);
        setFeedback('');
    };

    // ==========================================================
    // FECHAR FORMULÁRIO
    // ==========================================================

    const limparFormulario = () => {
        setTitulo('');
        setDescricao('');
        setDataVencimento('');
        setPrioridade('Média');
        setTarefaEditando(null);
        setModalFormulario(false);
    };

    // ==========================================================
    // SALVAR TAREFA
    // ==========================================================

    const salvarTarefa = async () => {
        if (!usuarioUid) {
            mostrarFeedback(
                'Entre novamente para gerenciar suas tarefas.',
                true
            );
            return;
        }

        const tituloNormalizado = titulo.trim();
        const descricaoNormalizada = descricao.trim();
        const dataNormalizada = dataVencimento.trim();

        if (!tituloNormalizado) {
            mostrarFeedback(
                'Informe o título da tarefa.',
                true
            );
            return;
        }

        // A data é opcional, mas deve ser válida quando preenchida.
        if (
            dataNormalizada !== '' &&
            !dataValida(dataNormalizada)
        ) {
            mostrarFeedback(
                'Digite uma data válida no formato DD/MM/AAAA.',
                true
            );
            return;
        }

        try {
            setSalvando(true);
            setFeedback('');

            if (tarefaEditando) {
                // UPDATE: altera os campos da tarefa existente.
                await updateDoc(
                    doc(db, 'tarefas', tarefaEditando.id),
                    {
                        titulo: tituloNormalizado,
                        descricao: descricaoNormalizada,
                        dataVencimento: dataNormalizada,
                        prioridade,
                        atualizadoEm: serverTimestamp(),
                    }
                );

                limparFormulario();

                mostrarFeedback('Tarefa atualizada com sucesso.');
            } else {
                // CREATE: cria uma tarefa nova no Firestore.
                await addDoc(
                    collection(db, 'tarefas'),
                    {
                        uid: usuarioUid,
                        titulo: tituloNormalizado,
                        descricao: descricaoNormalizada,
                        dataVencimento: dataNormalizada,
                        prioridade,
                        concluida: false,
                        criadoEm: serverTimestamp(),
                        atualizadoEm: serverTimestamp(),
                    }
                );

                limparFormulario();

                mostrarFeedback('Tarefa criada com sucesso.');
            }
        } catch (error) {
            console.error('Erro ao salvar tarefa:', error);

            mostrarFeedback(
                'Não foi possível salvar. Verifique as permissões do Firestore.',
                true
            );
        } finally {
            setSalvando(false);
        }
    };

    // ==========================================================
    // CONCLUIR OU REABRIR
    // ==========================================================

    const alternarConclusao = async (tarefa: Tarefa) => {
        if (!usuarioUid || tarefa.uid !== usuarioUid) {
            mostrarFeedback(
                'Não foi possível alterar esta tarefa.',
                true
            );
            return;
        }

        try {
            await updateDoc(
                doc(db, 'tarefas', tarefa.id),
                {
                    concluida: !tarefa.concluida,
                    atualizadoEm: serverTimestamp(),
                }
            );

            mostrarFeedback(
                tarefa.concluida
                    ? 'Tarefa reaberta.'
                    : 'Tarefa concluída.'
            );
        } catch (error) {
            console.error('Erro ao atualizar tarefa:', error);

            mostrarFeedback(
                'Não foi possível alterar o status da tarefa.',
                true
            );
        }
    };

    // ==========================================================
    // ABRIR CONFIRMAÇÃO DE EXCLUSÃO
    // ==========================================================

    const confirmarExclusao = (tarefa: Tarefa) => {
        // ALTERAÇÃO: não usamos Alert.alert.
        // Esta confirmação funciona dentro do próprio aplicativo.
        setTarefaParaExcluir(tarefa);
        setFeedback('');
    };

    // ==========================================================
    // EXCLUIR TAREFA
    // ==========================================================

    const excluirTarefa = async () => {
        const tarefa = tarefaParaExcluir;

        if (!tarefa || excluindo) {
            return;
        }

        if (!usuarioUid || tarefa.uid !== usuarioUid) {
            mostrarFeedback(
                'Não foi possível excluir esta tarefa.',
                true
            );

            setTarefaParaExcluir(null);
            return;
        }

        try {
            setExcluindo(true);

            // DELETE: exclui o documento selecionado do Firestore.
            await deleteDoc(
                doc(db, 'tarefas', tarefa.id)
            );

            setTarefaParaExcluir(null);

            mostrarFeedback('Tarefa excluída com sucesso.');
        } catch (error) {
            console.error('Erro ao excluir tarefa:', error);

            mostrarFeedback(
                'Não foi possível excluir. Verifique as permissões do Firestore.',
                true
            );
        } finally {
            setExcluindo(false);
        }
    };

    // ==========================================================
    // SAIR DA CONTA
    // ==========================================================

    const sairDaConta = async () => {
        try {
            await signOut(auth);
            router.replace('/');
        } catch (error) {
            console.error('Erro ao sair:', error);

            mostrarFeedback(
                'Não foi possível sair da conta.',
                true
            );
        }
    };

    // ==========================================================
    // BUSCA E FILTROS
    // ==========================================================

    const tarefasFiltradas = tarefas.filter((tarefa) => {
        const termo = busca.trim().toLowerCase();

        const correspondeBusca =
            tarefa.titulo.toLowerCase().includes(termo) ||
            tarefa.descricao.toLowerCase().includes(termo) ||
            (tarefa.dataVencimento || '').includes(termo);

        const correspondeFiltro =
            filtro === 'Todas' ||
            (filtro === 'Pendentes' && !tarefa.concluida) ||
            (filtro === 'Atrasadas' && estaAtrasada(tarefa)) ||
            (filtro === 'Concluídas' && tarefa.concluida);

        return correspondeBusca && correspondeFiltro;
    }).sort(compararTarefas);

    const totalTarefas = tarefas.length;

    const totalPendentes = tarefas.filter(
        (tarefa) => !tarefa.concluida
    ).length;

    const totalConcluidas = tarefas.filter(
        (tarefa) => tarefa.concluida
    ).length;

    const totalAtrasadas = tarefas.filter(estaAtrasada).length;

    // ==========================================================
    // CARREGAMENTO
    // ==========================================================

    if (verificandoSessao) {
        return (
            <SafeAreaView style= { styles.container } >
            <View style={ styles.centralizado }>
                <ActivityIndicator size="large" color = "#208AEF" />
                    <Text style={ styles.textoCarregamento }>
                        Verificando sua conta...
        </Text>
            </View>
            </SafeAreaView>
        );
    }

    if (!usuarioUid) {
        return (
            <SafeAreaView style= { styles.container } >
            <View style={ styles.centralizado }>
                <ActivityIndicator size="large" color = "#208AEF" />
                    <Text style={ styles.textoCarregamento }>
                        Redirecionando para o login...
        </Text>
            </View>
            </SafeAreaView>
        );
    }

    // ==========================================================
    // INTERFACE PRINCIPAL
    // ==========================================================

    return (
        <SafeAreaView style= { styles.container } >
        <View style={ styles.content }>

        {/* CABEÇALHO */ }

            < View style = { styles.header } >
                <View style={ styles.headerTextos }>
                    <Text style={ styles.ola }> Olá! </Text>

                        < Text style = { styles.tituloPagina } >
                            Minhas tarefas
                                </Text>

                                < Text style = { styles.subtituloPagina } >
                                    Organize seu dia com o Tarefino.
                        </Text>
                                        </View>

                                        < TouchableOpacity
    style = { styles.botaoSair }
    onPress = { sairDaConta }
        >
        <Text style={ styles.textoBotaoSair }>
            Sair
            </Text>
            </TouchableOpacity>
            </View>

    {/* FEEDBACK */ }

    {
        feedback ? (
            <TouchableOpacity
                        style= {
            [
            styles.feedback,
            feedbackErro && styles.feedbackErro,
                        ]}
                        onPress = {() => setFeedback('')
    }
    activeOpacity = { 0.8}
        >
        <Text
                            style={
        [
            styles.feedbackTexto,
            feedbackErro && styles.feedbackTextoErro,
        ]
    }
                        >
    { feedback }  ×
    </Text>
        </TouchableOpacity>
                ) : null
}

{/* RESUMO */ }

<View style={ styles.resumoContainer }>
    <View style={ styles.resumoCard }>
        <Text style={ styles.resumoNumero }>
        { totalTarefas }
            </Text>
            < Text style = { styles.resumoLegenda } > Total </Text>
                </View>

                < View style = { styles.resumoCard } >
                    <Text style={ [styles.resumoNumero, styles.numeroPendente] }>
                    { totalPendentes }
                        </Text>
                        < Text style = { styles.resumoLegenda } > Pendentes </Text>
                            </View>

                            <View style={ styles.resumoCard }>
    <Text style={ [styles.resumoNumero, styles.numeroAtrasado] }>
    { totalAtrasadas }
        </Text>
        < Text style = { styles.resumoLegenda } > Atrasadas </Text>
            </View>

                            < View style = { styles.resumoCard } >
                                <Text style={ [styles.resumoNumero, styles.numeroConcluido] }>
                                { totalConcluidas }
                                    </Text>
                                    < Text style = { styles.resumoLegenda } > Concluídas </Text>
                                        </View>
                                        </View>

{/* PESQUISA */ }

<View style={ styles.buscaContainer }>
    <Text style={ styles.iconeBusca }>⌕</Text>

        < TextInput
style = { styles.inputBusca }
placeholder = "Buscar tarefas..."
placeholderTextColor = "#999"
value = { busca }
onChangeText = { setBusca }
    />
    </View>

{/* FILTROS */ }

<View style={ styles.filtrosContainer }>
    {(
        ['Todas', 'Pendentes', 'Atrasadas', 'Concluídas'] as Filtro[]
    ).map((opcao) => (
        <TouchableOpacity
                            key= { opcao }
                            style = {
            [
            styles.filtroBotao,
            filtro === opcao && styles.filtroBotaoAtivo,
                            ]}
                            onPress = {() => setFiltro(opcao)}
                        >
        <Text
                                style={
        [
        styles.filtroTexto,
        filtro === opcao && styles.filtroTextoAtivo,
                                ]}
    >
    { opcao }
    </Text>
    </TouchableOpacity>
    ))}
</View>

{/* LISTA */ }

<View style={ styles.listaHeader }>
    <Text style={ styles.listaTitulo }>
        Suas atividades
            </Text>

            < Text style = { styles.listaQuantidade } >
            { tarefasFiltradas.length } tarefa(s)
                </Text>
                </View>

{
    carregando ? (
        <View style= { styles.centralizadoLista } >
        <ActivityIndicator size="large" color = "#208AEF" />
            <Text style={ styles.textoCarregamento }>
                Carregando tarefas...
    </Text>
        </View>
                ) : erroCarregamento ? (
        <View style= { styles.estadoVazio } >
        <Text style={ styles.estadoVazioTitulo }>
            Não foi possível carregar
                </Text>
                < Text style = { styles.estadoVazioTexto } >
                { erroCarregamento }
                    </Text>
                    </View>
                ) : (
        <FlatList
                        style= { styles.lista }
    data = { tarefasFiltradas }
    keyExtractor = {(item) => item.id
}
showsVerticalScrollIndicator = { false}
contentContainerStyle = {
    tarefasFiltradas.length === 0
        ? styles.listaVazia
        : styles.listaConteudo
}
renderItem = {({ item }) => (
    <View
                                style= {
        [
        styles.tarefaCard,
        item.concluida && styles.tarefaCardConcluida,
        estaAtrasada(item) && styles.tarefaCardAtrasada,
                                ]}
    >
    <TouchableOpacity
                                    style={
    [
        styles.checkbox,
        item.concluida && styles.checkboxMarcado,
    ]
}
onPress = {() => alternarConclusao(item)}
                                >
    <Text style={ styles.checkboxTexto }>
    { item.concluida ? '✓' : '' }
        </Text>
        </TouchableOpacity>

        < View style = { styles.tarefaInfo } >
            <Text
                                        style={
    [
        styles.tarefaTitulo,
        item.concluida &&
        styles.tarefaTituloConcluido,
    ]
}
                                    >
{ item.titulo }
    </Text>

{
    item.descricao ? (
        <Text style= { styles.tarefaDescricao } >
        { item.descricao }
        </Text>
                                    ) : null
}

{
    item.dataVencimento ? (
        <Text
            style={ [
                styles.dataTarefa,
                estaAtrasada(item) && styles.dataAtrasada,
            ] }
        >
        Data : { item.dataVencimento }
        { estaAtrasada(item)
            ? ` · ${diasDeAtraso(item)} ${diasDeAtraso(item) === 1 ? 'dia' : 'dias'} de atraso`
            : venceHoje(item)
                ? ' · vence hoje'
                : '' }
        </Text>
                                    ) : null
}

<View style={ styles.badgesLinha }>
<View
                                        style={
    [
        styles.statusBadge,
        item.concluida ? styles.statusConcluido : estaAtrasada(item) ? styles.statusAtrasado : styles.statusPendente,
    ]
}
                                    >
    <Text
                                            style={
    [
        styles.statusTexto,
        item.concluida ? styles.statusTextoConcluido : estaAtrasada(item) ? styles.statusTextoAtrasado : styles.statusTextoPendente,
    ]
}
                                        >
{
    item.concluida ? 'Concluída' : estaAtrasada(item) ? 'Atrasada' : 'Pendente'
}
    </Text>
    </View>
{ !item.concluida ? (
    <View style={ [styles.prioridadeBadge, estilosPrioridade(prioridadeDe(item)).badge] }>
        <Text style={ [styles.prioridadeBadgeTexto, estilosPrioridade(prioridadeDe(item)).texto] }>
            Prioridade { prioridadeDe(item).toLowerCase() }
        </Text>
    </View>
) : null }
</View>
    </View>

    < View style = { styles.acoesContainer } >
        <TouchableOpacity
                                        style={ styles.acaoBotao }
onPress = {() => abrirEdicao(item)}
                                    >
    <Text style={ styles.acaoEditar }>✎</Text>
        </TouchableOpacity>

        < TouchableOpacity
style = { styles.acaoBotao }
onPress = {() => confirmarExclusao(item)}
                                    >
    <Text style={ styles.acaoExcluir }>×</Text>
        </TouchableOpacity>
        </View>
        </View>
                        )}
ListEmptyComponent = {
                            < View style = { styles.estadoVazio } >
    <Text style={ styles.estadoVazioIcone }>✓</Text>

        < Text style = { styles.estadoVazioTitulo } >
            Nenhuma tarefa encontrada
                </Text>

                < Text style = { styles.estadoVazioTexto } >
                    Crie uma tarefa ou altere os filtros.
                                </Text>
                        </View>
                        }
                    />
                )}

{/* NOVA TAREFA */ }

<TouchableOpacity
                    style={ styles.botaoNovaTarefa }
onPress = { abrirNovaTarefa }
    >
    <Text style={ styles.botaoNovaTarefaIcone }> +</Text>
        < Text style = { styles.botaoNovaTarefaTexto } >
            Nova tarefa
                </Text>
                </TouchableOpacity>
                </View>

{/* ==================================================
                MODAL DO FORMULÁRIO
                ALTERAÇÃO: rolagem interna para não esconder a data.
            ================================================== */}

<Modal
                visible={ modalFormulario }
transparent
animationType = "fade"
onRequestClose = { limparFormulario }
    >
    <KeyboardAvoidingView
                    style={ styles.modalOverlay }
behavior = { Platform.OS === 'ios' ? 'padding' : undefined }
    >
    <View style={ styles.modal }>

        <View style={ styles.modalHeader }>
            <View style={ styles.modalTituloContainer }>
                <Text style={ styles.modalTitulo }>
                { tarefaEditando? 'Editar tarefa': 'Nova tarefa' }
                    </Text>

                    < Text style = { styles.modalSubtitulo } >
                        Preencha os campos abaixo.
                                </Text>
                            </View>

                            < TouchableOpacity
onPress = { limparFormulario }
style = { styles.fecharModal }
disabled = { salvando }
    >
    <Text style={ styles.fecharModalTexto }>×</Text>
        </TouchableOpacity>
        </View>

        < ScrollView
style = { styles.formScroll }
contentContainerStyle = { styles.formConteudo }
keyboardShouldPersistTaps = "handled"
showsVerticalScrollIndicator
    >
    <Text style={ styles.formLabel }>
        Título *
        </Text>

        < TextInput
style = { styles.formInput }
placeholder = "Ex.: Estudar React Native"
placeholderTextColor = "#999"
value = { titulo }
onChangeText = { setTitulo }
maxLength = { 100}
editable = {!salvando}
                            />

{/* PRIORIDADE */ }

<Text style={ styles.formLabel }>
    Prioridade
</Text>

<View style={ styles.prioridadeOpcoes }>
    { PRIORIDADES.map((opcao) => {
        const ativa = prioridade === opcao;

        return (
            <TouchableOpacity
                key={ opcao }
                style={ [
                    styles.prioridadeOpcao,
                    ativa && styles.prioridadeOpcaoAtiva,
                ] }
                onPress={ () => setPrioridade(opcao) }
                disabled={ salvando }
            >
                <Text
                    style={ [
                        styles.prioridadeOpcaoTexto,
                        ativa && styles.prioridadeOpcaoTextoAtivo,
                    ] }
                >
                    { opcao }
                </Text>
            </TouchableOpacity>
        );
    }) }
</View>

{/* ALTERAÇÃO: campo da data agora aparece logo abaixo do título. */ }

<Text style={ styles.formLabel }>
    Data de vencimento
        </Text>

        < TextInput
style = { styles.formInput }
placeholder = "DD/MM/AAAA"
placeholderTextColor = "#999"
value = { dataVencimento }
onChangeText = {(valor) =>
setDataVencimento(aplicarMascaraData(valor))
                                }
keyboardType = "numeric"
maxLength = { 10}
editable = {!salvando}
                            />

    < Text style = { styles.ajudaData } >
        Opcional.Exemplo: 09102026 será exibido como 09 / 10 / 2026.
            </Text>

            < Text style = { styles.formLabel } >
                Descrição
                </Text>

                < TextInput
style = { [styles.formInput, styles.formDescricao]}
placeholder = "Descreva a atividade..."
placeholderTextColor = "#999"
value = { descricao }
onChangeText = { setDescricao }
multiline
textAlignVertical = "top"
maxLength = { 500}
editable = {!salvando}
                            />

    < Text style = { styles.limiteTexto } >
        { descricao.length } / 500 caracteres
            </Text>
            </ScrollView>

{/* Os botões ficam fora da área rolável. */ }

<View style={ styles.modalAcoes }>
    <TouchableOpacity
                                style={ styles.botaoCancelar }
onPress = { limparFormulario }
disabled = { salvando }
    >
    <Text style={ styles.botaoCancelarTexto }>
        Cancelar
        </Text>
        </TouchableOpacity>

        < TouchableOpacity
style = {
    [
    styles.botaoSalvar,
    salvando && styles.botaoSalvarDesabilitado,
                                ]}
onPress = { salvarTarefa }
disabled = { salvando }
    >
{
    salvando?(
                                    <ActivityIndicator color = "#FFFFFF" />
                                ): (
            <Text style = {styles.botaoSalvarTexto} >
{ tarefaEditando? 'Salvar alterações': 'Criar tarefa' }
    </Text>
                                )}
</TouchableOpacity>
    </View>
    </View>
    </KeyboardAvoidingView>
    </Modal>

{/* ==================================================
                MODAL PRÓPRIO DE CONFIRMAÇÃO DE EXCLUSÃO
                ALTERAÇÃO: substitui Alert.alert.
            ================================================== */}

<Modal
                visible={ tarefaParaExcluir !== null }
transparent
animationType = "fade"
onRequestClose = {() => {
    if (!excluindo) {
        setTarefaParaExcluir(null);
    }
}}
            >
    <View style={ styles.modalOverlay }>
        <View style={ styles.confirmacaoModal }>
            <View style={ styles.iconeExcluirContainer }>
                <Text style={ styles.iconeExcluirTexto }>×</Text>
                    </View>

                    < Text style = { styles.confirmacaoTitulo } >
                        Excluir tarefa ?
                            </Text>

                            < Text style = { styles.confirmacaoMensagem } >
                                Você está prestes a excluir:
</Text>

    < Text style = { styles.confirmacaoNome } >
    { tarefaParaExcluir?.titulo }
        </Text>

        < Text style = { styles.confirmacaoAviso } >
            Essa ação não pode ser desfeita.
                        </Text>

                < View style = { styles.modalAcoes } >
                    <TouchableOpacity
                                style={ styles.botaoCancelar }
onPress = {() => setTarefaParaExcluir(null)}
disabled = { excluindo }
    >
    <Text style={ styles.botaoCancelarTexto }>
        Cancelar
        </Text>
        </TouchableOpacity>

        < TouchableOpacity
style = { styles.botaoExcluirConfirmacao }
onPress = { excluirTarefa }
disabled = { excluindo }
    >
{
    excluindo?(
                                    <ActivityIndicator color = "#FFFFFF" />
                                ): (
            <Text style = {styles.botaoExcluirTexto} >
    Sim, excluir
    </Text>
                                )}
</TouchableOpacity>
    </View>
    </View>
    </View>
    </Modal>
    </SafeAreaView>
    );
}

// ============================================================
// ESTILOS
// ============================================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F7F9FC',
    },

    content: {
        flex: 1,
        width: '100%',
        maxWidth: 650,
        alignSelf: 'center',
        paddingHorizontal: 22,
        paddingTop: 18,
        paddingBottom: 12,
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
    },

    headerTextos: {
        flex: 1,
        paddingRight: 12,
    },

    ola: {
        fontSize: 14,
        color: '#777',
        marginBottom: 2,
    },

    tituloPagina: {
        fontSize: 27,
        fontWeight: '700',
        color: '#222',
    },

    subtituloPagina: {
        fontSize: 13,
        color: '#777',
        marginTop: 4,
    },

    botaoSair: {
        paddingVertical: 9,
        paddingHorizontal: 15,
        borderRadius: 9,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D9DEE7',
    },

    textoBotaoSair: {
        color: '#555',
        fontSize: 13,
        fontWeight: '600',
    },

    feedback: {
        backgroundColor: '#DFF5E5',
        borderRadius: 9,
        padding: 10,
        marginBottom: 12,
    },

    feedbackErro: {
        backgroundColor: '#FFE5E5',
    },

    feedbackTexto: {
        color: '#16843E',
        fontSize: 12,
        fontWeight: '600',
    },

    feedbackTextoErro: {
        color: '#B42318',
    },

    resumoContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 17,
    },

    resumoCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 13,
        paddingVertical: 13,
        paddingHorizontal: 4,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E5EAF1',
    },

    resumoNumero: {
        fontSize: 24,
        fontWeight: '700',
        color: '#208AEF',
    },

    numeroPendente: {
        color: '#E89B13',
    },

    numeroConcluido: {
        color: '#20A050',
    },

    numeroAtrasado: {
        color: '#E5484D',
    },

    resumoLegenda: {
        fontSize: 11,
        color: '#777',
        marginTop: 3,
    },

    buscaContainer: {
        height: 45,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D9DEE7',
        borderRadius: 11,
        paddingHorizontal: 12,
        marginBottom: 13,
    },

    iconeBusca: {
        fontSize: 25,
        color: '#8290A3',
        marginRight: 8,
    },

    inputBusca: {
        flex: 1,
        fontSize: 14,
        color: '#222',
    },

    filtrosContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 18,
    },

    filtroBotao: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: '#D9DEE7',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
    },

    filtroBotaoAtivo: {
        backgroundColor: '#208AEF',
        borderColor: '#208AEF',
    },

    filtroTexto: {
        fontSize: 11,
        fontWeight: '600',
        color: '#666',
    },

    filtroTextoAtivo: {
        color: '#FFFFFF',
    },

    listaHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 11,
    },

    listaTitulo: {
        fontSize: 17,
        fontWeight: '700',
        color: '#222',
    },

    listaQuantidade: {
        fontSize: 12,
        color: '#888',
    },

    lista: {
        flex: 1,
    },

    listaConteudo: {
        paddingBottom: 12,
    },

    listaVazia: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingBottom: 20,
    },

    centralizado: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 25,
    },

    centralizadoLista: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },

    textoCarregamento: {
        fontSize: 14,
        color: '#777',
        marginTop: 12,
        textAlign: 'center',
    },

    tarefaCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5EAF1',
        borderRadius: 13,
        padding: 13,
        marginBottom: 10,
        gap: 11,
    },

    tarefaCardConcluida: {
        backgroundColor: '#FBFDFC',
    },

    tarefaCardAtrasada: {
        borderColor: '#F3B4B6',
        borderLeftWidth: 4,
        borderLeftColor: '#E5484D',
    },

    checkbox: {
        width: 23,
        height: 23,
        borderWidth: 1.5,
        borderColor: '#B9C5D5',
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },

    checkboxMarcado: {
        backgroundColor: '#20A050',
        borderColor: '#20A050',
    },

    checkboxTexto: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },

    tarefaInfo: {
        flex: 1,
        minWidth: 0,
    },

    tarefaTitulo: {
        fontSize: 14,
        color: '#222',
        fontWeight: '700',
        lineHeight: 20,
    },

    tarefaTituloConcluido: {
        color: '#89938D',
        textDecorationLine: 'line-through',
    },

    tarefaDescricao: {
        fontSize: 12,
        color: '#777',
        lineHeight: 18,
        marginTop: 4,
    },

    dataTarefa: {
        fontSize: 11,
        color: '#208AEF',
        fontWeight: '600',
        marginTop: 7,
    },

    dataAtrasada: {
        color: '#D93036',
    },

    statusBadge: {
        alignSelf: 'flex-start',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
        marginTop: 8,
    },

    statusPendente: {
        backgroundColor: '#FFF2D7',
    },

    statusConcluido: {
        backgroundColor: '#DFF5E5',
    },

    statusAtrasado: {
        backgroundColor: '#FDE7E8',
    },

    statusTexto: {
        fontSize: 10,
        fontWeight: '700',
    },

    statusTextoPendente: {
        color: '#A66B00',
    },

    statusTextoConcluido: {
        color: '#16843E',
    },

    statusTextoAtrasado: {
        color: '#C62828',
    },

    acoesContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },

    acaoBotao: {
        width: 30,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        backgroundColor: '#F5F7FA',
    },

    acaoEditar: {
        fontSize: 20,
        color: '#208AEF',
    },

    acaoExcluir: {
        fontSize: 24,
        color: '#D93025',
        lineHeight: 26,
    },

    estadoVazio: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5EAF1',
    },

    estadoVazioIcone: {
        fontSize: 30,
        color: '#208AEF',
        marginBottom: 10,
    },

    estadoVazioTitulo: {
        fontSize: 16,
        fontWeight: '700',
        color: '#333',
        textAlign: 'center',
        marginBottom: 6,
    },

    estadoVazioTexto: {
        fontSize: 13,
        lineHeight: 19,
        color: '#777',
        textAlign: 'center',
    },

    botaoNovaTarefa: {
        height: 49,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#208AEF',
        borderRadius: 12,
        marginTop: 10,
        gap: 8,
    },

    botaoNovaTarefaIcone: {
        color: '#FFFFFF',
        fontSize: 26,
        lineHeight: 29,
    },

    botaoNovaTarefaTexto: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },

    // ==========================================================
    // MODAIS
    // ==========================================================

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.48)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },

    modal: {
        width: '100%',
        maxWidth: 440,
        maxHeight: '90%',
        flexShrink: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
    },

    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },

    modalTituloContainer: {
        flex: 1,
        paddingRight: 10,
    },

    modalTitulo: {
        fontSize: 22,
        fontWeight: '700',
        color: '#222',
    },

    modalSubtitulo: {
        fontSize: 13,
        lineHeight: 19,
        color: '#777',
        marginTop: 5,
    },

    fecharModal: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#F1F4F8',
        alignItems: 'center',
        justifyContent: 'center',
    },

    fecharModalTexto: {
        fontSize: 26,
        color: '#555',
        lineHeight: 29,
    },

    // ALTERAÇÃO: área rolável do formulário.
    formScroll: {
        flexShrink: 1,
        minHeight: 0,
    },

    formConteudo: {
        paddingBottom: 8,
    },

    formLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        marginBottom: 7,
    },

    formInput: {
        minHeight: 46,
        borderWidth: 1,
        borderColor: '#D9DEE7',
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 13,
        paddingVertical: 12,
        fontSize: 14,
        color: '#222',
        marginBottom: 15,
    },

    formDescricao: {
        minHeight: 85,
    },

    limiteTexto: {
        fontSize: 11,
        color: '#888',
        textAlign: 'right',
        marginTop: -10,
        marginBottom: 8,
    },

    ajudaData: {
        fontSize: 11,
        color: '#777',
        lineHeight: 16,
        marginTop: -9,
        marginBottom: 15,
    },

    badgesLinha: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },

    prioridadeBadge: {
        alignSelf: 'flex-start',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
        marginTop: 8,
    },

    prioridadeBadgeTexto: {
        fontSize: 10,
        fontWeight: '700',
    },

    prioridadeAlta: {
        backgroundColor: '#FFE6D2',
    },

    prioridadeTextoAlta: {
        color: '#B54708',
    },

    prioridadeMedia: {
        backgroundColor: '#E3F0FF',
    },

    prioridadeTextoMedia: {
        color: '#1769C2',
    },

    prioridadeBaixa: {
        backgroundColor: '#ECEFF3',
    },

    prioridadeTextoBaixa: {
        color: '#5B6676',
    },

    prioridadeOpcoes: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 15,
    },

    prioridadeOpcao: {
        flex: 1,
        paddingVertical: 11,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: '#D9DEE7',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
    },

    prioridadeOpcaoAtiva: {
        backgroundColor: '#208AEF',
        borderColor: '#208AEF',
    },

    prioridadeOpcaoTexto: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
    },

    prioridadeOpcaoTextoAtivo: {
        color: '#FFFFFF',
    },

    modalAcoes: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },

    botaoCancelar: {
        flex: 1,
        minHeight: 46,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#D9DEE7',
        borderRadius: 10,
        paddingHorizontal: 8,
    },

    botaoCancelarTexto: {
        fontSize: 13,
        fontWeight: '600',
        color: '#555',
    },

    botaoSalvar: {
        flex: 1.4,
        minHeight: 46,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#208AEF',
        borderRadius: 10,
        paddingHorizontal: 8,
    },

    botaoSalvarDesabilitado: {
        opacity: 0.7,
    },

    botaoSalvarTexto: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFFFFF',
        textAlign: 'center',
    },

    // ALTERAÇÃO: estilos da confirmação de exclusão.
    confirmacaoModal: {
        width: '100%',
        maxWidth: 390,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
    },

    iconeExcluirContainer: {
        width: 55,
        height: 55,
        borderRadius: 28,
        backgroundColor: '#FFE5E5',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 15,
    },

    iconeExcluirTexto: {
        color: '#D93025',
        fontSize: 34,
        lineHeight: 37,
    },

    confirmacaoTitulo: {
        color: '#222222',
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 9,
    },

    confirmacaoMensagem: {
        color: '#666666',
        fontSize: 13,
        textAlign: 'center',
    },

    confirmacaoNome: {
        color: '#222222',
        fontSize: 15,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 8,
        marginBottom: 8,
    },

    confirmacaoAviso: {
        color: '#D93025',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 3,
    },

    botaoExcluirConfirmacao: {
        flex: 1.4,
        minHeight: 46,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#D93025',
        borderRadius: 10,
        paddingHorizontal: 8,
    },

    botaoExcluirTexto: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'center',
    },
});

// Estilos do selo de prioridade (declarada depois dos estilos, usada na lista).
function estilosPrioridade(prioridade: Prioridade) {
    if (prioridade === 'Alta') {
        return {
            badge: styles.prioridadeAlta,
            texto: styles.prioridadeTextoAlta,
        };
    }

    if (prioridade === 'Baixa') {
        return {
            badge: styles.prioridadeBaixa,
            texto: styles.prioridadeTextoBaixa,
        };
    }

    return {
        badge: styles.prioridadeMedia,
        texto: styles.prioridadeTextoMedia,
    };
}
