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
    Alert,
} from 'react-native';

import { FontAwesome } from '@expo/vector-icons';

// ALTERAÇÃO: importamos reload, sendEmailVerification e signOut
// para verificar o endereço e reenviar o link quando necessário.
import {
    signInWithEmailAndPassword,
    sendEmailVerification,
    reload,
    signOut,
} from 'firebase/auth';

import { auth } from '../firebaseConfig';
import { useRouter } from 'expo-router';

// ============================================================
// TELA INICIAL — LOGIN TAREFINO
// ============================================================

export default function Login() {
    const router = useRouter();

    // ==========================================================
    // ESTADOS
    // ==========================================================

    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');

    const [modalSucesso, setModalSucesso] = useState(false);
    const [modalErro, setModalErro] = useState(false);
    const [mensagemErro, setMensagemErro] = useState('');

    const [carregando, setCarregando] = useState(false);

    // ALTERAÇÃO: controla a exibição do botão para reenviar o link.
    const [emailPendenteVerificacao, setEmailPendenteVerificacao] =
        useState(false);

    // ==========================================================
    // LOGIN COM E-MAIL E SENHA
    // ==========================================================

    const handleLogin = async () => {
        const emailNormalizado = email.toLowerCase().trim();

        if (!emailNormalizado || !senha) {
            setMensagemErro('Informe seu e-mail e sua senha.');
            setEmailPendenteVerificacao(false);
            setModalErro(true);
            return;
        }

        try {
            setCarregando(true);
            setEmailPendenteVerificacao(false);

            const resultado = await signInWithEmailAndPassword(
                auth,
                emailNormalizado,
                senha
            );

            // ALTERAÇÃO: atualiza os dados da conta antes de
            // verificar se o usuário confirmou seu endereço.
            await reload(resultado.user);

            if (!resultado.user.emailVerified) {
                // ALTERAÇÃO: impede que uma conta não verificada
                // prossiga para a tela de tarefas.
                await signOut(auth);

                setEmailPendenteVerificacao(true);

                setMensagemErro(
                    'Seu e-mail ainda não foi verificado. Abra o link enviado para sua caixa de entrada e confirme o endereço antes de entrar. Confira também a pasta de spam.'
                );

                setModalErro(true);
                return;
            }

            console.log(
                'Usuário autenticado:',
                resultado.user.uid
            );

            setModalSucesso(true);

        } catch (error: any) {
            console.error('Erro ao realizar login:', error);

            setEmailPendenteVerificacao(false);

            if (
                error?.code === 'auth/invalid-credential' ||
                error?.code === 'auth/user-not-found' ||
                error?.code === 'auth/wrong-password'
            ) {
                setMensagemErro('E-mail ou senha inválidos.');

            } else if (error?.code === 'auth/invalid-email') {
                setMensagemErro('Informe um e-mail válido.');

            } else {
                setMensagemErro(
                    'Não foi possível realizar o login. Verifique sua conexão com o Firebase.'
                );
            }

            setModalErro(true);

        } finally {
            setCarregando(false);
        }
    };

    // ==========================================================
    // REENVIAR LINK DE VERIFICAÇÃO
    // ==========================================================

    const reenviarVerificacao = async () => {
        const emailNormalizado = email.toLowerCase().trim();

        if (!emailNormalizado || !senha) {
            setMensagemErro(
                'Digite seu e-mail e sua senha para reenviar o link de verificação.'
            );

            setEmailPendenteVerificacao(true);
            setModalErro(true);
            return;
        }

        try {
            setCarregando(true);
            setModalErro(false);

            // ALTERAÇÃO: autenticamos novamente para obter a conta
            // e enviar outro link de verificação.
            const resultado = await signInWithEmailAndPassword(
                auth,
                emailNormalizado,
                senha
            );

            await reload(resultado.user);

            if (resultado.user.emailVerified) {
                await signOut(auth);

                setEmailPendenteVerificacao(false);

                setMensagemErro(
                    'Seu e-mail já está verificado. Tente entrar novamente.'
                );

                setModalErro(true);
                return;
            }

            // ALTERAÇÃO: envia um novo link para o e-mail cadastrado.
            await sendEmailVerification(resultado.user);

            // ALTERAÇÃO: encerramos a sessão porque o endereço
            // ainda não foi confirmado.
            await signOut(auth);

            setEmailPendenteVerificacao(false);

            setMensagemErro(
                'Enviamos um novo link de verificação. Confira sua caixa de entrada e a pasta de spam.'
            );

            setModalErro(true);

        } catch (error: any) {
            console.error(
                'Erro ao reenviar verificação:',
                error
            );

            // Evita deixar uma sessão ativa se o envio falhar.
            if (auth.currentUser) {
                try {
                    await signOut(auth);
                } catch (erroSessao) {
                    console.error(
                        'Erro ao encerrar sessão:',
                        erroSessao
                    );
                }
            }

            setEmailPendenteVerificacao(false);

            if (
                error?.code === 'auth/invalid-credential' ||
                error?.code === 'auth/user-not-found' ||
                error?.code === 'auth/wrong-password'
            ) {
                setMensagemErro(
                    'Não foi possível validar as credenciais. Confira o e-mail e a senha e tente novamente.'
                );

            } else {
                setMensagemErro(
                    'Não foi possível reenviar o link. Verifique a conexão com o Firebase e tente novamente.'
                );
            }

            setModalErro(true);

        } finally {
            setCarregando(false);
        }
    };

    // ==========================================================
    // NAVEGAÇÃO
    // ==========================================================

    const irParaCadastro = () => {
        router.push('/cadastro');
    };

    const irParaTarefas = () => {
        setModalSucesso(false);
        router.replace('/tarefas');
    };

    // ==========================================================
    // LOGIN SOCIAL
    // ==========================================================

    const handleGoogleLogin = () => {
        Alert.alert(
            'Login com Google',
            'A autenticação com Google precisa ser configurada separadamente.'
        );
    };

    const handleAppleLogin = () => {
        Alert.alert(
            'Login com Apple',
            'A autenticação com Apple precisa ser configurada separadamente.'
        );
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

        < Text style = { styles.title } > Entrar </Text>

            < Text style = { styles.subtitle } >
                Acesse sua conta para continuar
                    </Text>

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
    editable = {!carregando
}
                    />
    </View>

{/* SENHA */ }

<View style={ styles.inputContainer }>
    <Text style={ styles.label }> Senha </Text>

        < TextInput
style = { styles.input }
placeholder = "Digite sua senha"
placeholderTextColor = "#999"
value = { senha }
onChangeText = { setSenha }
secureTextEntry
autoCapitalize = "none"
editable = {!carregando}
                    />
    </View>

{/* BOTÃO ENTRAR */ }

<TouchableOpacity
                    style={
    [
        styles.loginButton,
        carregando && styles.buttonDisabled,
    ]
}
onPress = { handleLogin }
disabled = { carregando }
    >
{
    carregando?(
                        <ActivityIndicator color = "#FFFFFF" />
                    ): (
            <Text style = {styles.loginButtonText} >
    Entrar
    </Text>
                    )}
</TouchableOpacity>

{/* SEPARADOR */ }

<View style={ styles.dividerContainer }>
    <View style={ styles.dividerLine } />
        < Text style = { styles.dividerText } > ou </Text>
            < View style = { styles.dividerLine } />
                </View>

{/* GOOGLE */ }

<TouchableOpacity
                    style={ styles.socialButton }
onPress = { handleGoogleLogin }
activeOpacity = { 0.7}
    >
    <View style={ styles.socialIconContainer }>
        <FontAwesome
                            name="google"
size = { 17}
color = "#4285F4"
    />
    </View>

    < Text style = { styles.socialButtonText } >
        Continuar com Google
            </Text>
            </TouchableOpacity>

{/* APPLE */ }

<TouchableOpacity
                    style={ styles.socialButton }
onPress = { handleAppleLogin }
activeOpacity = { 0.7}
    >
    <View style={ styles.socialIconContainer }>
        <FontAwesome
                            name="apple"
size = { 20}
color = "#111111"
    />
    </View>

    < Text style = { styles.socialButtonText } >
        Continuar com Apple
            </Text>
            </TouchableOpacity>

{/* CRIAR CONTA */ }

<View style={ styles.registerContainer }>
    <Text style={ styles.registerText }>
        Não tem uma conta ?
            </Text>

            < TouchableOpacity
                        onPress = { irParaCadastro }
activeOpacity = { 0.7}
    >
    <Text style={ styles.registerLink }>
        Criar conta
            </Text>
            </TouchableOpacity>
            </View>
            </View>

{/* ==================================================
                MODAL DE LOGIN REALIZADO
            ================================================== */}

<Modal
                visible={ modalSucesso }
transparent
animationType = "fade"
onRequestClose = {() => setModalSucesso(false)}
            >
    <View style={ styles.modalOverlay }>
        <View style={ styles.modal }>
            <Text style={ styles.successIcon }>✓</Text>

                < Text style = { styles.modalTitle } >
                    Login realizado!
                        </Text>

                        < Text style = { styles.modalMessage } >
                            E - mail confirmado.Bem - vindo ao Tarefino.
                        </Text>

                                < TouchableOpacity
style = { styles.modalButton }
onPress = { irParaTarefas }
    >
    <Text style={ styles.modalButtonText }>
        Continuar
        </Text>
        </TouchableOpacity>
        </View>
        </View>
        </Modal>

{/* ==================================================
                MODAL DE ERRO E VERIFICAÇÃO
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
                    Verificação de acesso
                        </Text>

                        < Text style = { styles.modalMessage } >
                        { mensagemErro }
                            </Text>

{/* ALTERAÇÃO: opção de reenvio somente
                            quando o login detectar um e-mail pendente. */}

{
    emailPendenteVerificacao ? (
        <TouchableOpacity
                                style= { styles.resendButton }
                                onPress = { reenviarVerificacao }
    disabled = { carregando }
        >
    {
        carregando?(
                                    <ActivityIndicator color = "#208AEF" />
                                ): (
                <Text style = {styles.resendButtonText} >
        Reenviar link de verificação
            </Text>
                                )
}
</TouchableOpacity>
                        ) : null}

<TouchableOpacity
                            style={ styles.modalButton }
onPress = {() => setModalErro(false)}
disabled = { carregando }
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
        width: 140,
        height: 140,
        alignSelf: 'center',
        marginBottom: 0,
    },

    title: {
        fontSize: 27,
        fontWeight: '700',
        color: '#222',
        textAlign: 'center',
        marginBottom: 5,
    },

    subtitle: {
        fontSize: 13,
        color: '#777',
        textAlign: 'center',
        marginBottom: 22,
    },

    inputContainer: {
        marginBottom: 13,
    },

    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        marginBottom: 5,
    },

    input: {
        height: 46,
        borderWidth: 1,
        borderColor: '#D9DEE7',
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 13,
        fontSize: 14,
        color: '#222',
    },

    loginButton: {
        height: 46,
        backgroundColor: '#208AEF',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 3,
    },

    buttonDisabled: {
        opacity: 0.7,
    },

    loginButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },

    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 18,
        marginBottom: 13,
    },

    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#E0E5ED',
    },

    dividerText: {
        color: '#777',
        fontSize: 12,
        paddingHorizontal: 12,
    },

    socialIconContainer: {
        position: 'absolute',
        left: 15,
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },

    socialButton: {
        height: 43,
        borderWidth: 1,
        borderColor: '#D9DEE7',
        borderRadius: 9,
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 9,
    },

    socialButtonText: {
        color: '#222222',
        fontSize: 13,
        fontWeight: '500',
    },

    registerContainer: {
        alignItems: 'center',
        marginTop: 9,
    },

    registerText: {
        color: '#777777',
        fontSize: 12,
        marginBottom: 2,
    },

    registerLink: {
        color: '#208AEF',
        fontSize: 13,
        fontWeight: '700',
    },

    // ==========================================================
    // MODAIS
    // ==========================================================

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
        padding: 28,
        alignItems: 'center',
    },

    successIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#DFF5E5',
        color: '#20A050',
        fontSize: 36,
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
        marginBottom: 15,
    },

    // ALTERAÇÃO: estilo do botão de reenvio do link.
    resendButton: {
        width: '100%',
        minHeight: 46,
        borderWidth: 1,
        borderColor: '#208AEF',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
        marginBottom: 8,
    },

    resendButtonText: {
        color: '#208AEF',
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'center',
    },

    modalButton: {
        width: '100%',
        minHeight: 48,
        backgroundColor: '#208AEF',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 5,
    },

    modalButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
    },
});