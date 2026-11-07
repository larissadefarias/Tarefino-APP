import React, { useState } from 'react';

import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Image,
    Modal,
    SafeAreaView,
    ActivityIndicator,
} from 'react-native';

import {
    collection,
    addDoc,
    query,
    where,
    getDocs,
} from 'firebase/firestore';

// ALTERAÇÃO: importamos as funções para criar a conta,
// enviar o e-mail de verificação e encerrar a sessão.
import {
    createUserWithEmailAndPassword,
    sendEmailVerification,
    signOut,
} from 'firebase/auth';

import { db, auth } from '../firebaseConfig';
import { useRouter } from 'expo-router';

// ============================================================
// TELA DE CADASTRO
// ============================================================

export default function Cadastro() {
    const router = useRouter();

    // ==========================================================
    // ESTADOS
    // ==========================================================

    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [telefone, setTelefone] = useState('');
    const [senha, setSenha] = useState('');
    const [confirmarSenha, setConfirmarSenha] = useState('');

    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [mostrarConfirmarSenha, setMostrarConfirmarSenha] =
        useState(false);

    const [modalSucesso, setModalSucesso] = useState(false);
    const [modalErro, setModalErro] = useState(false);
    const [mensagemErro, setMensagemErro] = useState('');

    const [carregando, setCarregando] = useState(false);

    // ==========================================================
    // REQUISITOS DA SENHA
    // ==========================================================

    const senhaValida = {
        tamanho: senha.length >= 8,
        maiuscula: /[A-Z]/.test(senha),
        minuscula: /[a-z]/.test(senha),
        numero: /[0-9]/.test(senha),
        especial: /[^A-Za-z0-9]/.test(senha),
    };

    const senhaForte =
        senhaValida.tamanho &&
        senhaValida.maiuscula &&
        senhaValida.minuscula &&
        senhaValida.numero &&
        senhaValida.especial;

    // ==========================================================
    // CADASTRO
    // ==========================================================

    const handleCadastro = async () => {
        const nomeNormalizado = nome.trim();

        const emailNormalizado = email
            .toLowerCase()
            .trim();

        const telefoneNormalizado = telefone.replace(/\D/g, '');

        // ------------------------------------------------------
        // CONTROLE DAS ETAPAS DO CADASTRO
        // ------------------------------------------------------

        // ALTERAÇÃO: essas variáveis permitem apresentar uma
        // mensagem correta se uma etapa falhar após criar a conta.
        let contaCriada = false;
        let perfilSalvo = false;
        let emailEnviado = false;

        // ------------------------------------------------------
        // VALIDAÇÃO DOS CAMPOS
        // ------------------------------------------------------

        if (
            !nomeNormalizado ||
            !emailNormalizado ||
            !telefoneNormalizado ||
            !senha ||
            !confirmarSenha
        ) {
            setMensagemErro('Preencha todos os campos.');
            setModalErro(true);
            return;
        }

        const emailValido =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado);

        if (!emailValido) {
            setMensagemErro('Informe um e-mail válido.');
            setModalErro(true);
            return;
        }

        if (!senhaForte) {
            setMensagemErro(
                'A senha não atende aos requisitos de segurança.'
            );
            setModalErro(true);
            return;
        }

        if (senha !== confirmarSenha) {
            setMensagemErro('As senhas não coincidem.');
            setModalErro(true);
            return;
        }

        if (telefoneNormalizado.length < 10) {
            setMensagemErro('Informe um telefone válido.');
            setModalErro(true);
            return;
        }

        try {
            setCarregando(true);

            // --------------------------------------------------
            // VERIFICAÇÃO DO TELEFONE
            // --------------------------------------------------

            const consultaTelefone = query(
                collection(db, 'usuarios'),
                where('telefone', '==', telefoneNormalizado)
            );

            const resultadoTelefone =
                await getDocs(consultaTelefone);

            if (!resultadoTelefone.empty) {
                setMensagemErro(
                    'Este telefone já está cadastrado.'
                );
                setModalErro(true);
                return;
            }

            // ==================================================
            // ETAPA 1 — CRIAR A CONTA NO FIREBASE AUTH
            // ==================================================

            const resultado =
                await createUserWithEmailAndPassword(
                    auth,
                    emailNormalizado,
                    senha
                );

            // ALTERAÇÃO: o Firebase cria a conta e gera seu UID.
            const uid = resultado.user.uid;
            contaCriada = true;

            // ==================================================
            // ETAPA 2 — SALVAR O PERFIL NO FIRESTORE
            // ==================================================

            // ALTERAÇÃO: salvamos somente os dados do perfil.
            // A senha fica sob responsabilidade do Authentication.
            await addDoc(collection(db, 'usuarios'), {
                uid,
                nome: nomeNormalizado,
                email: emailNormalizado,
                telefone: telefoneNormalizado,
                criadoEm: new Date(),
            });

            perfilSalvo = true;

            // ==================================================
            // ETAPA 3 — ENVIAR O LINK DE VERIFICAÇÃO
            // ==================================================

            // ALTERAÇÃO: o Firebase envia automaticamente um
            // e-mail com um link para confirmar o endereço.
            await sendEmailVerification(resultado.user);

            emailEnviado = true;

            // ==================================================
            // ETAPA 4 — ENCERRAR A SESSÃO
            // ==================================================

            // ALTERAÇÃO: o usuário deve confirmar o e-mail e
            // depois entrar novamente no aplicativo.
            await signOut(auth);

            // ==================================================
            // CADASTRO INICIADO COM SUCESSO
            // ==================================================

            setModalSucesso(true);

        } catch (error: any) {
            console.error(
                'Erro ao realizar cadastro:',
                error
            );

            // ALTERAÇÃO: evitamos deixar uma sessão parcialmente
            // criada ativa se alguma etapa do cadastro falhar.
            if (contaCriada) {
                try {
                    await signOut(auth);
                } catch (erroSessao) {
                    console.error(
                        'Erro ao encerrar sessão:',
                        erroSessao
                    );
                }
            }

            if (error?.code === 'auth/email-already-in-use') {
                setMensagemErro(
                    'Este e-mail já possui uma conta.'
                );

            } else if (error?.code === 'auth/invalid-email') {
                setMensagemErro(
                    'Informe um e-mail válido.'
                );

            } else if (error?.code === 'auth/weak-password') {
                setMensagemErro(
                    'A senha informada é muito fraca.'
                );

            } else if (contaCriada && perfilSalvo && !emailEnviado) {
                // ALTERAÇÃO: o perfil já existe, mas o envio falhou.
                setMensagemErro(
                    'A conta foi criada, mas não foi possível enviar o e-mail de verificação. Entre na tela de login e use a opção de reenviar o link.'
                );

            } else if (contaCriada && !perfilSalvo) {
                setMensagemErro(
                    'A conta foi criada no Authentication, mas não foi possível salvar o perfil no Firestore. Verifique as permissões da base antes de continuar.'
                );

            } else {
                setMensagemErro(
                    'Não foi possível concluir o cadastro. Verifique sua conexão com o Firebase.'
                );
            }

            setModalErro(true);

        } finally {
            setCarregando(false);
        }
    };

    // ==========================================================
    // VOLTAR PARA LOGIN
    // ==========================================================

    const voltarLogin = () => {
        setModalSucesso(false);
        router.replace('/');
    };

    // ==========================================================
    // INTERFACE
    // ==========================================================

    return (
        <SafeAreaView style= { styles.container } >
        <View style={ styles.content }>

        {/* LOGO */ }

            < Image
    source = { require('../../assets/images/logo-tarefino.png') }
    style = { styles.logo }
    resizeMode = "contain"
        />

    {/* TÍTULO */ }

        < Text style = { styles.title } >
            Primeiro acesso
                </Text>

                < Text style = { styles.subtitle } >
                    Crie sua conta no Tarefino
                        </Text>

    {/* NOME */ }

    <View style={ styles.inputContainer }>
        <Text style={ styles.label }> Nome </Text>

            < TextInput
    style = { styles.input }
    placeholder = "Digite seu nome"
    placeholderTextColor = "#999"
    value = { nome }
    onChangeText = { setNome }
    autoCapitalize = "words"
    editable = {!carregando
}
                    />
    </View>

{/* E-MAIL */ }

<View style={ styles.inputContainer }>
    <Text style={ styles.label }> E - mail </Text>

        < TextInput
style = { styles.input }
placeholder = "Digite seu e-mail"
placeholderTextColor = "#999"
value = { email }
onChangeText = { setEmail }
keyboardType = "email-address"
autoCapitalize = "none"
autoCorrect = { false}
editable = {!carregando}
                    />
    </View>

{/* TELEFONE */ }

<View style={ styles.inputContainer }>
    <Text style={ styles.label }> Telefone </Text>

        < TextInput
style = { styles.input }
placeholder = "Digite seu telefone"
placeholderTextColor = "#999"
value = { telefone }
onChangeText = { setTelefone }
keyboardType = "phone-pad"
editable = {!carregando}
                    />
    </View>

{/* SENHA */ }

<View style={ styles.inputContainer }>
    <Text style={ styles.label }> Senha </Text>

        < View style = { styles.passwordContainer } >
            <TextInput
                            style={ styles.passwordInput }
placeholder = "Digite sua senha"
placeholderTextColor = "#999"
value = { senha }
onChangeText = { setSenha }
secureTextEntry = {!mostrarSenha}
autoCapitalize = "none"
editable = {!carregando}
                        />

    < TouchableOpacity
onPress = {() =>
setMostrarSenha(!mostrarSenha)
                            }
                        >
    <Text style={ styles.showPassword }>
    { mostrarSenha? 'Ocultar': 'Mostrar' }
        </Text>
        </TouchableOpacity>
        </View>
        </View>

{/* REQUISITOS DA SENHA */ }

<View style={ styles.passwordRules }>
    <Text style={ styles.rulesTitle }>
        A senha deve conter:
</Text>

    < Text
style = {
    senhaValida.tamanho
        ? styles.ruleValid
        : styles.rule
}
    >
{ senhaValida.tamanho ? '✓' : '○' } Mínimo de 8 caracteres
    </Text>

    < Text
style = {
    senhaValida.maiuscula
        ? styles.ruleValid
        : styles.rule
}
    >
{ senhaValida.maiuscula ? '✓' : '○' } Uma letra maiúscula
    </Text>

    < Text
style = {
    senhaValida.minuscula
        ? styles.ruleValid
        : styles.rule
}
    >
{ senhaValida.minuscula ? '✓' : '○' } Uma letra minúscula
    </Text>

    < Text
style = {
    senhaValida.numero
        ? styles.ruleValid
        : styles.rule
}
    >
{ senhaValida.numero ? '✓' : '○' } Um número
    </Text>

    < Text
style = {
    senhaValida.especial
        ? styles.ruleValid
        : styles.rule
}
    >
{ senhaValida.especial ? '✓' : '○' } Um caractere especial
    </Text>
    </View>

{/* CONFIRMAR SENHA */ }

<View style={ styles.inputContainer }>
    <Text style={ styles.label }>
        Confirmar senha
            </Text>

            < View style = { styles.passwordContainer } >
                <TextInput
                            style={ styles.passwordInput }
placeholder = "Digite novamente sua senha"
placeholderTextColor = "#999"
value = { confirmarSenha }
onChangeText = { setConfirmarSenha }
secureTextEntry = {!mostrarConfirmarSenha}
autoCapitalize = "none"
editable = {!carregando}
                        />

    < TouchableOpacity
onPress = {() =>
setMostrarConfirmarSenha(
    !mostrarConfirmarSenha
)
                            }
                        >
    <Text style={ styles.showPassword }>
    {
        mostrarConfirmarSenha
        ? 'Ocultar'
            : 'Mostrar'
    }
        </Text>
        </TouchableOpacity>
        </View>
        </View>

{/* BOTÃO CADASTRAR */ }

<TouchableOpacity
                    style={
    [
        styles.cadastroButton,
        carregando && styles.buttonDisabled,
    ]
}
onPress = { handleCadastro }
disabled = { carregando }
    >
{
    carregando?(
                        <ActivityIndicator color = "#FFFFFF" />
                    ): (
            <Text style = {styles.cadastroButtonText} >
    Criar conta
        </Text>
                    )}
</TouchableOpacity>

{/* VOLTAR PARA LOGIN */ }

<TouchableOpacity
                    style={ styles.loginLink }
onPress = { voltarLogin }
disabled = { carregando }
    >
    <Text style={ styles.loginText }>
        Já tenho uma conta
            </Text>
            </TouchableOpacity>
            </View>

{/* ==================================================
                MODAL DE VERIFICAÇÃO DE E-MAIL
            ================================================== */}

<Modal
                visible={ modalSucesso }
transparent
animationType = "fade"
onRequestClose = { voltarLogin }
    >
    <View style={ styles.modalOverlay }>
        <View style={ styles.modal }>
            <Text style={ styles.successIcon }>✉</Text>

                < Text style = { styles.modalTitle } >
                    Confirme seu e - mail
                        </Text>

                        < Text style = { styles.modalMessage } >
                            Enviamos um link de verificação para:
</Text>

    < Text style = { styles.emailDestaque } >
    { email.trim() }
        </Text>

        < Text style = { styles.modalMessage } >
            Abra seu e - mail, clique no link de
                            confirmação e depois volte ao Tarefino
                            para entrar.Confira também a pasta de spam.
                        </Text>

    < TouchableOpacity
style = { styles.modalButton }
onPress = { voltarLogin }
    >
    <Text style={ styles.modalButtonText }>
        Ir para login
            </Text>
            </TouchableOpacity>
            </View>
            </View>
            </Modal>

{/* ==================================================
                MODAL DE ERRO
            ================================================== */}

<Modal
                visible={ modalErro }
transparent
animationType = "fade"
onRequestClose = {() => setModalErro(false)}
            >
    <View style={ styles.modalOverlay }>
        <View style={ styles.modal }>
            <Text style={ styles.errorIcon }> !</Text>

                < Text style = { styles.modalTitle } >
                    Não foi possível concluir
                        </Text>

                        < Text style = { styles.modalMessage } >
                        { mensagemErro }
                            </Text>

                            < TouchableOpacity
style = { styles.modalButton }
onPress = {() => setModalErro(false)}
                        >
    <Text style={ styles.modalButtonText }>
        Entendi
        </Text>
        </TouchableOpacity>
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
        maxWidth: 500,
        alignSelf: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
    },

    logo: {
        width: 110,
        height: 110,
        alignSelf: 'center',
        marginBottom: 0,
    },

    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#222',
        textAlign: 'center',
        marginBottom: 4,
    },

    subtitle: {
        fontSize: 13,
        color: '#777',
        textAlign: 'center',
        marginBottom: 15,
    },

    inputContainer: {
        marginBottom: 9,
    },

    label: {
        fontSize: 12,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },

    input: {
        height: 43,
        borderWidth: 1,
        borderColor: '#D9DEE7',
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 13,
        fontSize: 14,
        color: '#222',
    },

    passwordContainer: {
        height: 43,
        borderWidth: 1,
        borderColor: '#D9DEE7',
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 13,
        paddingRight: 10,
    },

    passwordInput: {
        flex: 1,
        fontSize: 14,
        color: '#222',
    },

    showPassword: {
        color: '#208AEF',
        fontSize: 11,
        fontWeight: '600',
        marginLeft: 8,
    },

    passwordRules: {
        backgroundColor: '#F1F6FC',
        borderRadius: 8,
        padding: 8,
        marginBottom: 9,
    },

    rulesTitle: {
        fontSize: 11,
        fontWeight: '600',
        color: '#333',
        marginBottom: 2,
    },

    rule: {
        fontSize: 10,
        color: '#777',
        marginTop: 1,
    },

    ruleValid: {
        fontSize: 10,
        color: '#20A050',
        marginTop: 1,
    },

    cadastroButton: {
        height: 44,
        backgroundColor: '#208AEF',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 3,
    },

    buttonDisabled: {
        opacity: 0.7,
    },

    cadastroButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },

    loginLink: {
        alignItems: 'center',
        marginTop: 10,
    },

    loginText: {
        color: '#208AEF',
        fontSize: 13,
        fontWeight: '600',
    },

    // MODAIS

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 25,
    },

    modal: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 25,
        alignItems: 'center',
    },

    successIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#DFF5E5',
        color: '#20A050',
        fontSize: 29,
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: 60,
        marginBottom: 15,
    },

    errorIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FFE5E5',
        color: '#D93025',
        fontSize: 36,
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: 60,
        marginBottom: 15,
    },

    modalTitle: {
        fontSize: 21,
        fontWeight: '700',
        color: '#222',
        textAlign: 'center',
        marginBottom: 10,
    },

    modalMessage: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        lineHeight: 21,
        marginBottom: 12,
    },

    emailDestaque: {
        fontSize: 14,
        color: '#208AEF',
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 14,
    },

    modalButton: {
        width: '100%',
        minHeight: 48,
        backgroundColor: '#208AEF',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
        paddingHorizontal: 10,
    },

    modalButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
    },
});