import Cropper from 'cropperjs';
import { DEFAULT_AVATAR } from '../config/constants.js';
import { state, isCurrentUserAdmin } from '../state/store.js';
import { supabaseClient, loadFromSupabase } from '../services/supabase.js';
import { registrarLog } from '../services/logger.js';
import { esc } from '../utils/formatters.js';
import { iconSvg, deleteIcon, toast } from '../utils/icons.js';

let cropper = null;
let tempAvatarBase64 = null;

export function toggleAuthMode(mode) {
    const login = document.getElementById('login-form');
    const signup = document.getElementById('signup-form');
    const recovery = document.getElementById('recovery-form');
    const title = document.getElementById('auth-title');

    if (login) login.style.display = mode === 'login' ? 'block' : 'none';
    if (signup) signup.style.display = mode === 'signup' ? 'block' : 'none';
    if (recovery) recovery.style.display = mode === 'recovery' ? 'block' : 'none';

    if (title) {
        if (mode === 'login') title.textContent = 'Entrar no Sistema';
        if (mode === 'signup') title.textContent = 'Criar Conta';
        if (mode === 'recovery') title.textContent = 'Recuperar Senha';
    }
}

export async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return toast("Erro no login: " + error.message);

    await checkAuthState();
    registrarLog({
        acao: "AUTENTICACAO",
        modulo: "ACESSO",
        resumo: `Login realizado no sistema (${email})`,
        detalhes: { email }
    });
}

export async function handleSignUp(e) {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const name = document.getElementById('signup-name').value;

    const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, role: 'common' } }
    });

    if (error) return toast("Erro no cadastro: " + error.message);
    toast("Cadastro realizado! Verifique seu e-mail.");
    toggleAuthMode('login');
}

export function handleLogout() {
    document.getElementById('user-dropdown')?.classList.remove('show');
    const modal = document.getElementById('logoutModal');
    if (modal) modal.style.display = 'flex';
}

export function closeLogoutModal() {
    const modal = document.getElementById('logoutModal');
    if (modal) modal.style.display = 'none';
}

export async function confirmLogout() {
    closeLogoutModal();
    await registrarLog({
        acao: "AUTENTICACAO",
        modulo: "ACESSO",
        resumo: `Logout realizado pelo usuário`,
        detalhes: { email: state.currentUser?.email || "" }
    });
    await supabaseClient.auth.signOut();
    location.reload();
}

export async function handlePhotoUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const cropImage = document.getElementById('crop-image-preview');
        document.getElementById('cropModal').style.display = 'flex';

        cropImage.onload = () => {
            if (cropper) cropper.destroy();
            cropper = new Cropper(cropImage, {
                aspectRatio: 1,
                viewMode: 1,
                autoCropArea: 1
            });
        };
        cropImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

export async function confirmCrop() {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ width: 256, height: 256 });
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);

    tempAvatarBase64 = base64Image;

    const regPreview = document.getElementById('profile-edit-preview');
    if (regPreview) regPreview.src = base64Image;

    const editPreview = document.getElementById('editUserPhotoPreview');
    if (editPreview) editPreview.src = base64Image;

    const displayPhoto = document.getElementById('user-display-photo');
    if (displayPhoto) displayPhoto.src = base64Image;

    toast("Foto preparada!");
    cancelCrop();
}

export function cancelCrop() {
    document.getElementById('cropModal').style.display = 'none';
    if (cropper) cropper.destroy();
}

export function openUserEditModal(userId) {
    if (!isCurrentUserAdmin()) return toast("Acesso negado: apenas administradores podem editar usuários.");
    const user = state.db.usuarios.find(u => u.id === userId);
    if (!user) return;

    tempAvatarBase64 = null;
    document.getElementById("editUserId").value = user.id;
    document.getElementById("editUserName").value = user.full_name;
    document.getElementById("editUserPhone").value = user.phone || "";
    document.getElementById("editUserRole").value = user.role || "common";
    document.getElementById("editUserPhotoPreview").src = user.avatar_url || DEFAULT_AVATAR;

    document.getElementById("userEditModal").style.display = "flex";
}

export function closeUserEditModal() {
    document.getElementById("userEditModal").style.display = "none";
}

export async function handleUserEdit(e) {
    e.preventDefault();
    if (!isCurrentUserAdmin()) return toast("Acesso negado: apenas administradores podem editar usuários.");
    const id = document.getElementById("editUserId").value;
    const full_name = document.getElementById("editUserName").value;
    const phone = document.getElementById("editUserPhone").value;
    const role = document.getElementById("editUserRole").value;

    const updateData = { full_name, phone, role };
    if (tempAvatarBase64) {
        updateData.avatar_url = tempAvatarBase64;
    }

    try {
        const { error: dbError } = await supabaseClient
            .from('usuarios')
            .update(updateData)
            .eq('id', id);

        if (dbError) throw dbError;

        if (state.currentUser && id === state.currentUser.id) {
            const authUpdate = { data: { full_name, phone, role } };
            if (tempAvatarBase64) {
                authUpdate.data.avatar_url = tempAvatarBase64;
            }

            const { error: authError } = await supabaseClient.auth.updateUser(authUpdate);
            if (authError) console.warn("Erro ao sincronizar metadados Auth:", authError.message);
        }

        toast("Usuário atualizado com sucesso!");
        registrarLog({
            acao: "EDICAO",
            modulo: "USUARIOS",
            resumo: `Dados do usuário "${full_name}" atualizados (Perfil: ${role})`,
            detalhes: { usuarioId: id, nome: full_name, telefone: phone, perfil: role }
        });
        closeUserEditModal();
        loadFromSupabase();
    } catch (error) {
        console.error("Erro ao editar usuário:", error);
        alert("Erro ao salvar alterações: " + error.message);
    }
}

export function renderUsers() {
    const list = document.getElementById("user-list");
    const { db, currentUser } = state;
    if (!list || !currentUser) return;

    if (db.usuarios.length === 0) {
        list.innerHTML = '<div class="hint-text" style="text-align:center; padding:10px;">Nenhum outro usuário encontrado.</div>';
        return;
    }

    list.innerHTML = db.usuarios.map(u => {
        const isMe = u.id === currentUser.id;
        const roleLabel = u.role === 'admin' ? 'ADMINISTRADOR' : 'USUÁRIO';
        const roleClass = u.role === 'admin' ? 'blue' : 'green';

        return `
            <div class="item">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                    <img src="${u.avatar_url || DEFAULT_AVATAR}" class="user-avatar-small" style="width: 32px; height: 32px; border-width: 1px; flex-shrink: 0;">
                    <div style="display: flex; flex-direction: column; min-width: 0; overflow: hidden; flex: 1;">
                        <b style="font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${esc(u.full_name)} ${isMe ? '(Você)' : ''}</b>
                        <small style="color: var(--muted); font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${esc(u.email)}">${esc(u.email)}</small>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <span class="badge ${roleClass}" style="font-size: 0.65rem; min-height: 22px; padding: 0 8px;">${roleLabel}</span>
                    <button class="icon-btn blue" onclick="openUserEditModal('${u.id}')" title="Editar usuário">
                        ${iconSvg('editar')}
                    </button>
                    ${!isMe ? `
                        <button class="icon-btn danger" onclick="handleDeleteUser('${u.id}')" title="Remover acesso">
                            ${deleteIcon()}
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join("");
}

export async function handleDeleteUser(userId) {
    if (!isCurrentUserAdmin()) return toast("Acesso negado: apenas administradores podem excluir usuários.");
    if (!confirm("Deseja realmente remover o acesso deste usuário?")) return;
    const userAlvo = (state.db?.usuarios || []).find(u => u.id === userId);
    const { error } = await supabaseClient.from('usuarios').delete().eq('id', userId);
    if (error) return toast("Erro ao remover: " + error.message);
    registrarLog({
        acao: "EXCLUSAO",
        modulo: "USUARIOS",
        resumo: `Acesso do usuário "${userAlvo?.full_name || userId}" removido`,
        detalhes: { usuarioId: userId, nome: userAlvo?.full_name || "", email: userAlvo?.email || "" }
    });
    loadFromSupabase();
}

export function toggleUserDropdown(event) {
    event.stopPropagation();
    const menu = document.getElementById('user-dropdown');
    menu?.classList.toggle('show');
}

export function openUserCreateModal() {
    if (!isCurrentUserAdmin()) return toast("Acesso negado: apenas administradores podem cadastrar usuários.");
    document.getElementById('profile-edit-form')?.reset();
    tempAvatarBase64 = null;
    const preview = document.getElementById('profile-edit-preview');
    if (preview) preview.src = DEFAULT_AVATAR;
    document.getElementById('userCreateModal').style.display = 'flex';
}

export function closeUserCreateModal() {
    document.getElementById('userCreateModal').style.display = 'none';
}

export async function handleCreateUser(e) {
    e.preventDefault();
    if (!isCurrentUserAdmin()) return toast("Acesso negado: apenas administradores podem cadastrar usuários.");

    if (window.location.protocol === 'file:') {
        toast("ERRO: Use o arquivo abrir-pwa.bat para salvar dados.");
        return;
    }

    const name = document.getElementById('profile-edit-name').value;
    const email = document.getElementById('profile-edit-email').value;
    const password = document.getElementById('profile-edit-password').value;
    const phone = document.getElementById('profile-edit-phone').value;
    const role = document.getElementById('profile-edit-role').value;

    const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: name,
                phone,
                role,
                avatar_url: tempAvatarBase64 || DEFAULT_AVATAR
            }
        }
    });

    if (error) {
        console.error("Erro Supabase Auth:", error);
        alert("Erro ao cadastrar: " + error.message);
        return;
    }

    toast("Usuário cadastrado com sucesso!");
    registrarLog({
        acao: "INCLUSAO",
        modulo: "USUARIOS",
        resumo: `Novo usuário cadastrado: "${name}" (${email})`,
        detalhes: { nome: name, email, telefone: phone, perfil: role }
    });
    e.target.reset();
    tempAvatarBase64 = null;
    document.getElementById('profile-edit-preview').src = DEFAULT_AVATAR;
    closeUserCreateModal();
    loadFromSupabase();
}

export function applyRolePolicies(role) {
    const isAdmin = role === 'admin';
    state.currentRole = isAdmin ? 'admin' : 'common';

    const dropRole = document.getElementById('dropdown-role');
    if (dropRole) {
        dropRole.textContent = isAdmin ? 'ADMINISTRADOR' : 'USUÁRIO';
        dropRole.className = `badge ${isAdmin ? 'blue' : 'green'}`;
    }

    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
    });

    // Bloqueia campos de edição exclusiva de administrador (empresa, edição de lançamentos, plantel)
    const restrictedSelectors = [
        '#companyConfigForm input',
        '#companyConfigForm select',
        '#companyConfigForm textarea',
        '#companyConfigForm button[type="submit"]',
        '#editForm input',
        '#editForm select',
        '#editForm button[type="submit"]',
        '.plantel-input',
        '.admin-only-edit'
    ];

    document.querySelectorAll(restrictedSelectors.join(', ')).forEach(el => {
        el.disabled = !isAdmin;
        if (!isAdmin) {
            el.title = "Acesso restrito ao administrador";
        } else {
            el.removeAttribute('title');
        }
    });

    let roleStyle = document.getElementById('role-policy-style');
    if (!roleStyle) {
        roleStyle = document.createElement('style');
        roleStyle.id = 'role-policy-style';
        document.head.appendChild(roleStyle);
    }
    roleStyle.innerHTML = !isAdmin ? `
        .icon-btn.danger,
        .icon-btn.blue,
        .admin-only,
        .admin-only-delete,
        [data-page="page-configuracoes"] {
            display: none !important;
        }
    ` : '';

    // Se usuário comum estiver na aba de configurações, redireciona para Início
    if (!isAdmin) {
        const configPage = document.getElementById('page-configuracoes');
        if (configPage && configPage.classList.contains('active')) {
            document.querySelector('[data-page="page-visao-geral"]')?.click();
        }
    }
}

export async function checkAuthState() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const authScreen = document.getElementById('auth-screen');
    const appContent = document.getElementById('app-content');

    if (user) {
        state.currentUser = user;
        if (authScreen) authScreen.style.display = 'none';
        if (appContent) appContent.style.display = 'block';

        let name = user.user_metadata?.full_name || user.email;
        let role = user.user_metadata?.role || 'common';
        let photo = user.user_metadata?.avatar_url || DEFAULT_AVATAR;

        // Consulta o perfil atualizado na tabela `usuarios` do Supabase (prioridade sobre user_metadata)
        try {
            const { data: dbUser } = await supabaseClient
                .from('usuarios')
                .select('full_name, role, avatar_url, phone')
                .eq('id', user.id)
                .maybeSingle();

            if (dbUser) {
                if (dbUser.role) role = dbUser.role;
                if (dbUser.full_name) name = dbUser.full_name;
                if (dbUser.avatar_url) photo = dbUser.avatar_url;
            }
        } catch (err) {
            console.warn("Não foi possível consultar perfil em usuarios:", err);
        }

        const photoEl = document.getElementById('user-display-photo');
        if (photoEl) photoEl.src = photo;

        const dropName = document.getElementById('dropdown-name');
        if (dropName) dropName.textContent = name;

        applyRolePolicies(role);
        await loadFromSupabase();

        // Garante que após carregar db.usuarios a política reflita o perfil do banco
        const syncedUser = (state.db?.usuarios || []).find(u => u.id === user.id);
        if (syncedUser?.role && syncedUser.role !== role) {
            applyRolePolicies(syncedUser.role);
        }
    } else {
        if (authScreen) authScreen.style.display = 'flex';
        if (appContent) appContent.style.display = 'none';
    }
}

