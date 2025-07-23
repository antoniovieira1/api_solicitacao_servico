import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import session from 'express-session';
import mysql from 'mysql2/promise';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const app = express();
const port = process.env.PORT || 3001;
const allowedOrigins = [
  'https://mercotech.com.br',
  'https://www.mercotech.com.br'
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(cors(corsOptions));
app.use(express.json());
app.set('trust proxy', 1);
app.use(
  session({
    secret: process.env.SESSION_SECRET, 
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,  //não esquecer de mudar para true no deploy     
      httpOnly: true,     
      sameSite: 'none',   //mudar para none no deploy
      maxAge: 24 * 60 * 60 * 1000
    },
  })
);
let pool;
try {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '5', 10),
    connectTimeout: 20000,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,      
    keepAliveInitialDelay: 10000
  });
  console.log('Pool de conexões com o MySQL configurado.');
} catch (error) {
  console.error('Erro fatal ao criar o pool de conexões com o DB:', error);
  process.exit(1);
}
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Acesso não autenticado. Por favor, faça o login.' });
  }
};
async function testDbConnection() {
  if (!pool) {
    console.error('Pool de conexões não inicializado. Não é possível testar a conexão.');
    process.exit(1);
  }
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Conectado com sucesso ao banco de dados MySQL!');
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados MySQL:', error);
    process.exit(1);
  } finally {
    if (connection) connection.release();
  }
}
testDbConnection();

let allUsersCache = [];
let lastCacheTime = 0;

async function getAllUsers() {
    if (Date.now() - lastCacheTime > 300000 || allUsersCache.length === 0) {
        try {
            const jsonUrl = 'https://mercotech.com.br/internos/data/users.json';
            const response = await fetch(jsonUrl);
            if (!response.ok) {
                console.error(`Falha ao buscar o arquivo de usuários em ${jsonUrl}.`);
                return allUsersCache;
            }
            const usersObject = await response.json();
            allUsersCache = Object.values(usersObject);
            lastCacheTime = Date.now();
        } catch (error) {
            console.error('Erro ao buscar ou processar users.json:', error);
            return allUsersCache;
        }
    }
    return allUsersCache;
}

function executePythonScript(scriptName, args = []) {
  const scriptPath = path.join(__dirname, 'scripts', scriptName);
  const pythonProcess = spawn('python3', [scriptPath, ...args]);
  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python: ${scriptName}] stdout: ${data}`);
  });
  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Python: ${scriptName}] stderr: ${data}`);
  });
  pythonProcess.on('close', (code) => {
    console.log(`[Python: ${scriptName}] exited with code ${code}`);
  });
}// Substitua a sua função fetchOrderDetails inteira por esta versão

async function fetchOrderDetails(orderId) {
    let connection;
    try {
        connection = await pool.getConnection();
        const sql = `
      SELECT
        so.*,
        pa.pcm_comments, pa.requires_lab_evaluation, pa.scheduled_start_date,
        pa.scheduled_end_date, pa.total_downtime,
        pa.analyst_email AS pcm_analyst_email, 
        pa.analysis_date AS pcm_analysis_fill_date,
        pa.pcm_approval_status,      
        pa.pcm_approval_justification,      
        pa.pcm_approver_email,      
        pcm_approver_user.Nome as pcmApproverName,
        pa.pcm_approval_date,
        pa.requires_cipa,
        ca.id AS cipa_analysis_id_on_temp,
        ca.requires_pet_pt AS cipa_requires_pet_pt_on_temp,
        ca.pet_pt_id AS cipa_pet_pt_id_on_temp,
        ca.cipa_comments AS cipa_analysis_comments_on_temp,
        ca.cipa_analyst_email AS cipa_analyst_email_on_temp,
        ca.cipa_analysis_date AS cipa_analysis_fill_date_on_temp,
        ca.cipa_approved AS cipa_action_approved,
        ca.cipa_approver_email AS cipa_action_approver_email,
        -- Removida a busca pelo nome do cipa_approver aqui, faremos no código
        ca.cipa_approval_date AS cipa_action_approval_date,
        ca.cipa_approved_reason AS cipa_action_approved_reason,
        ca.cipa_rejection_reason AS cipa_action_rejection_reason,
        la.id AS lab_analysis_id,
        la.liberado_uso AS lab_liberado_uso,
        la.requalificacao AS lab_requalificacao,
        la.comments AS lab_analysis_comments,
        la.lab_approval_email AS lab_evaluator_email,
        lab_evaluator_user.Nome as labEvaluatorName,
        la.analysis_date AS lab_evaluation_date,
        pe.id AS pcm_execution_id,
        pe.execution_description AS pcm_execution_description,
        pe.execution_responsible_name,
        pe.executed_by_email AS pcm_executed_by_email,
        pcm_executor_user.Nome as pcmExecutorName,
        pe.execution_date AS pcm_execution_date,
        pe.houve_solicitacao_compra AS pcm_houve_compra,
        pe.numero_solicitacao_compra AS pcm_numero_compra,
        lr.id AS lab_reevaluation_id,
        lr.comments AS lab_reevaluation_comments,
        lr.evaluator_email AS lab_reevaluator_email,
        lr.liberado_uso AS lab_reeval_liberado_uso,
        lab_reevaluator_user.Nome as labReevaluatorName,
        lr.evaluation_date AS lab_reevaluation_date
      FROM service_orders so
      LEFT JOIN pcm_analysis pa ON so.id = pa.service_order_id
      LEFT JOIN imports pcm_approver_user ON pa.pcm_approver_email = pcm_approver_user.Email
      LEFT JOIN cipa_analysis_temp ca ON so.id = ca.service_order_id
      LEFT JOIN lab_analysis la ON so.id = la.service_order_id
      LEFT JOIN imports lab_evaluator_user ON la.lab_approval_email = lab_evaluator_user.Email
      LEFT JOIN pcm_execution pe ON so.id = pe.service_order_id
      LEFT JOIN imports pcm_executor_user ON pe.executed_by_email = pcm_executor_user.Email
      LEFT JOIN lab_reevaluation lr ON so.id = lr.service_order_id
      LEFT JOIN imports lab_reevaluator_user ON lr.evaluator_email = lab_reevaluator_user.Email
      WHERE so.id = ?
    `;
        const [rows] = await connection.execute(sql, [orderId]);
        
        if (rows.length > 0) {
            const orderData = rows[0];

            // Busca a lista de usuários do JSON
            const allUsers = await getAllUsers();
            
            // Encontra o solicitante e o validador de segurança na lista
            const requesterInfo = allUsers.find(u => u.email === orderData.requester_email);
            const safetyApproverInfo = allUsers.find(u => u.email === orderData.cipa_action_approver_email); // ✅ LINHA ADICIONADA

            const orderToReturn = {
                id: parseInt(orderData.id, 10),
                OSSM_ID: orderData.OSSM_ID,
                sector: orderData.sector,
                equipment: orderData.equipment,
                location: orderData.location,
                service: orderData.service_description,
                component: orderData.component,
                priority: orderData.priority,
                maintenanceType: orderData.maintenance_type,
                impactLevel: orderData.impact_level,
                observation: orderData.observation,
                requester_email: orderData.requester_email,
                requesterName: requesterInfo ? requesterInfo.name : orderData.requester_email,
                status: orderData.status,
                createdAt: orderData.created_at,
                updatedAt: orderData.updated_at,
                pcmComments: orderData.pcm_comments,
                requiresEvaluation: !!orderData.requires_lab_evaluation,
                requires_cipa: orderData.requires_cipa === null || orderData.requires_cipa === undefined ? true : !!orderData.requires_cipa,
                scheduledStartDate: orderData.scheduled_start_date,
                scheduledEndDate: orderData.scheduled_end_date,
                totalDowntime: orderData.total_downtime,
                analystEmail: orderData.pcm_analyst_email,
                analysisDate: orderData.pcm_analysis_fill_date,
                pcmApproval: (orderData.pcm_approver_email || orderData.pcm_approval_status !== null) ? {
                    approved: !!orderData.pcm_approval_status,
                    justification: orderData.pcm_approval_justification,
                    userName: orderData.pcmApproverName || orderData.pcm_approver_email,
                    date: orderData.pcm_approval_date,
                } : null,
                cipaAnalysisData: orderData.cipa_analysis_id_on_temp ? {
                    id: orderData.cipa_analysis_id_on_temp,
                    requires_pet_pt: !!orderData.cipa_requires_pet_pt_on_temp,
                    pet_pt_id: orderData.cipa_pet_pt_id_on_temp,
                    comments: orderData.cipa_analysis_comments_on_temp,
                    analyst_email: orderData.cipa_analyst_email_on_temp,
                    analysis_date: orderData.cipa_analysis_fill_date_on_temp,
                } : null,
                safetyValidation: orderData.cipa_action_approver_email ? {
                    approved: !!orderData.cipa_action_approved,
                    comments: orderData.cipa_action_approved ? orderData.cipa_action_approved_reason : orderData.cipa_action_rejection_reason,
                    userName: safetyApproverInfo ? safetyApproverInfo.name : orderData.cipa_action_approver_email,
                    rejectionReason: orderData.cipa_action_rejection_reason,
                    reasonapp: orderData.cipa_action_approved_reason,
                    reasondeny: orderData.cipa_action_rejection_reason,
                    date: orderData.cipa_action_approval_date,
                    petPtValidated: !!(orderData.cipa_requires_pet_pt_on_temp && orderData.cipa_pet_pt_id_on_temp),
                } : null,
                labAnalysisData: orderData.lab_analysis_id ? {
                    id: orderData.lab_analysis_id,
                    service_order_id: parseInt(orderData.id, 10),
                    liberado_uso: !!orderData.lab_liberado_uso,
                    requalificacao: !!orderData.lab_requalificacao,
                    comments: orderData.lab_analysis_comments,
                    lab_approval_email: orderData.lab_evaluator_email,
                    userName: orderData.labEvaluatorName || orderData.lab_evaluator_email,
                    analysis_date: orderData.lab_evaluation_date,
                } : null,
                pcmExecutionData: orderData.pcm_execution_id ? {
                    id: orderData.pcm_execution_id,
                    service_order_id: parseInt(orderData.id, 10),
                    execution_description: orderData.pcm_execution_description,
                    execution_responsible_name: orderData.execution_responsible_name,
                    executed_by_email: orderData.pcm_executed_by_email,
                    execution_date: orderData.pcm_execution_date,
                    houve_solicitacao_compra: !!orderData.pcm_houve_compra,
                    numero_solicitacao_compra: orderData.pcm_numero_compra,
                    userName: orderData.pcmExecutorName || orderData.pcm_executed_by_email,
                } : null,
                labReevaluationData: orderData.lab_reevaluation_id ? {
                    id: orderData.lab_reevaluation_id,
                    service_order_id: parseInt(orderData.id, 10),
                    comments: orderData.lab_reevaluation_comments,
                    evaluator_email: orderData.lab_reevaluator_email,
                    evaluation_date: orderData.lab_reevaluation_date,
                    releasedForUse: !!orderData.lab_reeval_liberado_uso,
                    userName: orderData.labReevaluatorName || orderData.lab_reevaluator_email,
                } : null,
                history: [],
            };
            return { success: true, order: orderToReturn };
        } else {
            return { success: false, message: 'Ordem de serviço não encontrada.' };
        }
    } catch (error) {
        console.error(`Erro ao buscar detalhes da OS ${orderId}:`, error);
        return { success: false, message: 'Erro interno ao buscar detalhes da OS.' };
    } finally {
        if (connection) connection.release();
    }
}
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios.' });
    }
    try {
        const jsonUrl = 'https://mercotech.com.br/internos/data/users.json';
        const response = await fetch(jsonUrl);
        if (!response.ok) {
            console.error(`Falha ao buscar o arquivo de usuários em ${jsonUrl}. Status: ${response.status}`);
            throw new Error('Não foi possível acessar os dados de autenticação.');
        }
        const usersObject = await response.json();
        const usersArray = Object.values(usersObject);
        const user = usersArray.find(u => u.email === email);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Email não encontrado ou credenciais inválidas.' });
        }
        if (user.is_auth !== 1) {
            return res.status(403).json({ success: false, message: 'Usuário não possui permissão para acessar o sistema.' });
        }
        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
            return res.status(401).json({ success: false, message: 'Senha incorreta ou credenciais inválidas.' });
        }
        let connection;
        let userRole = 'solicitante';
        try {
            connection = await pool.getConnection();
            const [roleRows] = await connection.execute(
                'SELECT role FROM role_assignments WHERE email = ? LIMIT 1',
                [email]
            );
            if (roleRows.length > 0) {
                userRole = roleRows[0].role;
            }
        } catch (dbError) {
            console.error('Erro ao buscar função do usuário no banco de dados:', dbError);
        } finally {
            if (connection) connection.release();
        }
        req.session.user = {
            email: user.email,
            name: user.name,
            role: userRole,
        };
        res.status(200).json({
            success: true,
            message: 'Login bem-sucedido!',
            user: req.session.user,
        });
    } catch (error) {
        console.error('Erro geral no endpoint de login:', error);
        res.status(500).json({ success: false, message: error.message || 'Erro interno do servidor durante o login.' });
    }
});
app.post('/api/service-orders', async (req, res) => {
    const {
        sector, equipment, location, service, component,
        observation,
        requesterEmail,
    } = req.body;
    if (!sector || !equipment || !location || !service || !requesterEmail) {
        return res.status(400).json({ success: false, message: 'Campos obrigatórios ausentes.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const initialStatus = 'aberta';
        const sql = `
      INSERT INTO service_orders (
        sector, equipment, location, service_description,
        observation, requester_email, status, created_at, updated_at,
        priority, maintenance_type, impact_level, component
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 'a_definir', 'a_definir', NULL, '')
    `;
        const [result] = await connection.execute(sql, [
            sector, equipment, location, service,
            observation || null, requesterEmail, initialStatus,
        ]);
        if (result.insertId) {
            const newOrderId = result.insertId;
            // NOVO: Enviar e-mail para o PCM
            try {
                const [pcmRoles] = await connection.execute('SELECT email FROM role_assignments WHERE role = ?', ['pcm']);
                if (pcmRoles.length > 0) {
                    const pcmEmails = pcmRoles.map(role => role.email).join(',');
                    executePythonScript('sendmailpcm.py', [newOrderId, pcmEmails]);
                }
            } catch (emailError) {
                console.error("Erro ao tentar enviar e-mail para o PCM:", emailError);
            }
            // FIM DA MODIFICAÇÃO
            const [rows] = await connection.execute(
                `SELECT so.*, i.Nome as requesterName
         FROM service_orders so
         LEFT JOIN imports i ON so.requester_email = i.Email
         WHERE so.id = ?`,
                [newOrderId]
            );
            if (rows.length > 0) {
                const newOrder = rows[0];
                res.status(201).json({
                    success: true,
                    message: 'Ordem de serviço criada com sucesso!',
                    order: {
                        ...newOrder,
                        id: parseInt(newOrder.id, 10),
                        service: newOrder.service_description,
                        maintenanceType: newOrder.maintenance_type,
                        createdAt: newOrder.created_at,
                    },
                });
            } else {
                throw new Error('Falha ao buscar a ordem de serviço recém-criada.');
            }
        } else {
            throw new Error('Falha ao criar a ordem de serviço, nenhum ID inserido.');
        }
    } catch (error) {
        console.error('Erro ao criar ordem de serviço:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor ao criar ordem de serviço.' });
    } finally {
        if (connection) connection.release();
    }
});
// Não esquecer de colocar ,isAutenthicated
app.get('/api/service-orders', isAuthenticated ,async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const sql = `
      SELECT so.*, i.Nome as requesterName
      FROM service_orders so
      LEFT JOIN imports i ON so.requester_email = i.Email
      ORDER BY so.created_at DESC
    `;
        const [rows] = await connection.execute(sql);
        connection.release();
        res.json({
            success: true,
            orders: rows.map(order => ({
                ...order,
                id: parseInt(order.id, 10),
                service: order.service_description,
                maintenanceType: order.maintenance_type,
                createdAt: order.created_at,
            })),
        });
    } catch (error) {
        if (connection) connection.release();
        console.error('Erro ao buscar ordens de serviço:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor ao buscar ordens de serviço.' });
    }
});
app.get('/api/service-orders/:id', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ success: false, message: 'ID da Ordem de Serviço inválido.' });
    }
    const orderDetails = await fetchOrderDetails(id);
    if (orderDetails.success) {
        res.json(orderDetails);
    } else {
        const statusCode = orderDetails.message === 'Ordem de serviço não encontrada.' ? 404 : 500;
        res.status(statusCode).json(orderDetails);
    }
});
app.put('/api/service-orders/:orderId/pcm-analysis-data', async (req, res) => {
    const { orderId } = req.params;
    const {
        pcmComments, requiresEvaluation, scheduledStartDate,
        scheduledEndDate, totalDowntime, analystEmail,
        priority, maintenanceType, impactLevel, component,
        requires_cipa
    } = req.body;
    if (isNaN(parseInt(orderId))) {
        return res.status(400).json({ success: false, message: 'ID da OS inválido.' });
    }
    if (!analystEmail) {
        return res.status(400).json({ success: false, message: 'Email do analista PCM é obrigatório para salvar.' });
    }
     let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const pcmAnalysisSql = `
      INSERT INTO pcm_analysis (
        service_order_id, pcm_comments, requires_lab_evaluation,
        scheduled_start_date, scheduled_end_date, total_downtime,
        analyst_email, analysis_date, requires_cipa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
      ON DUPLICATE KEY UPDATE
        pcm_comments = VALUES(pcm_comments),
        requires_lab_evaluation = VALUES(requires_lab_evaluation),
        scheduled_start_date = VALUES(scheduled_start_date),
        scheduled_end_date = VALUES(scheduled_end_date),
        total_downtime = VALUES(total_downtime),
        analyst_email = VALUES(analyst_email),
        analysis_date = NOW(),
        requires_cipa = VALUES(requires_cipa)
    `;
        await connection.execute(pcmAnalysisSql, [
            orderId, pcmComments || null, requiresEvaluation ?? false,
            scheduledStartDate || null, scheduledEndDate || null, totalDowntime || null,
            analystEmail,
            requires_cipa ?? true,
        ]);
        if (priority || maintenanceType || component) {
            const updateOrderSql = `
        UPDATE service_orders SET
          priority = ?,
          maintenance_type = ?,
          impact_level = ?,
          component = ?,
          updated_at = NOW()
        WHERE id = ?
      `;
            await connection.execute(updateOrderSql, [
                priority, maintenanceType, impactLevel || null, component || null, orderId
            ]);
        }
        await connection.commit();
         try {
            const [orderData] = await connection.execute('SELECT OSSM_ID FROM service_orders WHERE id = ?', [orderId]);
            const ossmId = orderData[0]?.OSSM_ID;
            if (ossmId) { // Só envia se já tiver OSSM_ID
                const [cipaRoles] = await connection.execute('SELECT email FROM role_assignments WHERE role IN (?)', [['cipa', 'seguranca']]);
                if (cipaRoles.length > 0) {
                    const cipaEmails = cipaRoles.map(role => role.email).join(',');
                    executePythonScript('sendmailcipa.py', [ossmId, cipaEmails]);
                }
            }
        } catch (emailError) {
            console.error("Erro ao tentar enviar e-mail para CIPA/Segurança:", emailError);
        }
        const updatedOrderData = await fetchOrderDetails(orderId);
        res.status(200).json(updatedOrderData);
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error(`Erro ao salvar análise PCM para OS ID ${orderId}:`, error);
        res.status(500).json({ success: false, message: `Erro interno: ${error.message}` });
    } finally {
        if (connection) connection.release();
    }
});


//isAuthenticated,
app.get('/api/me', isAuthenticated, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.session.user
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Não foi possível fazer logout.' });
    }
    res.clearCookie('connect.sid'); 
    res.status(200).json({ success: true, message: 'Logout bem-sucedido.' });
  });
});
app.post('/api/service-orders/:orderId/cipa-analysis', async (req, res) => {
    const { orderId } = req.params;
    const {
        requires_pet_pt, pet_pt_id, cipa_comments, cipa_analyst_email,
    } = req.body;
    if (isNaN(parseInt(orderId))) {
        return res.status(400).json({ success: false, message: 'ID da OS inválido.' });
    }
    if (typeof requires_pet_pt !== 'boolean' || !cipa_analyst_email) {
        return res.status(400).json({ success: false, message: 'Campos obrigatórios ausentes para salvar análise CIPA (requires_pet_pt, cipa_analyst_email).' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const sql = `
      INSERT INTO cipa_analysis_temp (
        service_order_id, requires_pet_pt, pet_pt_id, cipa_comments,
        cipa_analyst_email, cipa_analysis_date
      ) VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        requires_pet_pt = VALUES(requires_pet_pt),
        pet_pt_id = VALUES(pet_pt_id),
        cipa_comments = VALUES(cipa_comments),
        cipa_analyst_email = VALUES(cipa_analyst_email),
        cipa_analysis_date = NOW()
    `;
        await connection.execute(sql, [
            orderId, requires_pet_pt, (requires_pet_pt ? (pet_pt_id || null) : null),
            cipa_comments || null, cipa_analyst_email,
        ]);
        try {
            const [orderData] = await connection.execute('SELECT OSSM_ID FROM service_orders WHERE id = ?', [orderId]);
            const ossmId = orderData[0]?.OSSM_ID;
            const [pcmAnalysis] = await connection.execute('SELECT requires_lab_evaluation FROM pcm_analysis WHERE service_order_id = ?', [orderId]);
            if (ossmId && pcmAnalysis.length > 0) {
                const needsLab = pcmAnalysis[0].requires_lab_evaluation;
                if (needsLab) {
                    const [labRoles] = await connection.execute('SELECT email FROM role_assignments WHERE role = ?', ['laboratorio']);
                    if (labRoles.length > 0) {
                        const labEmails = labRoles.map(r => r.email).join(',');
                        executePythonScript('sendmaillab.py', [ossmId, labEmails]);
                    }
                } else {
                    const [pcmRoles] = await connection.execute('SELECT email FROM role_assignments WHERE role = ?', ['pcm']);
                    if (pcmRoles.length > 0) {
                        const pcmEmails = pcmRoles.map(r => r.email).join(',');
                        executePythonScript('sendcipatopcm.py', [ossmId, pcmEmails]);
                    }
                }
            }
        } catch(emailError) {
            console.error("Erro na lógica de e-mail CIPA->Lab/PCM:", emailError);
        }
        const updatedOrderData = await fetchOrderDetails(orderId);
        if (updatedOrderData.success) {
            res.json({
                success: true,
                message: 'Avaliação de Segurança/CIPA salva com sucesso!',
                order: updatedOrderData.order,
            });
        } else {
            throw new Error(updatedOrderData.message || 'Erro ao rebuscar OS após salvar análise CIPA.');
        }
    } catch (error) {
        if (connection) connection.release();
        console.error(`Erro ao salvar análise CIPA para OS ID ${orderId}:`, error);
        res.status(500).json({ success: false, message: `Erro interno: ${error.message}` });
    }
});
const allowedRoles = ['pcm', 'cipa', 'seguranca', 'laboratorio', 'administrador'];
app.get('/api/roles', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT * FROM role_assignments ORDER BY role, email ASC');
        connection.release();
        res.json({ success: true, roles: rows });
    } catch (error) {
        if (connection) connection.release();
        console.error('Erro ao buscar funções:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});
app.post('/api/roles', async (req, res) => {
    const { email, role } = req.body;
    if (!email || !role) {
        return res.status(400).json({ success: false, message: 'Email e função são obrigatórios.' });
    }
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Função inválida.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.execute('INSERT INTO role_assignments (email, role) VALUES (?, ?)', [email, role]);
        connection.release();
        res.status(201).json({ success: true, message: 'Função atribuída com sucesso!', assignment: { id: result.insertId, email, role } });
    } catch (error) {
        if (connection) connection.release();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Este email já possui esta função.' });
        }
        console.error('Erro ao criar associação de função:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});
app.delete('/api/roles/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.execute('DELETE FROM role_assignments WHERE id = ?', [id]);
        connection.release();
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Associação não encontrada.' });
        }
        res.json({ success: true, message: 'Associação de função deletada com sucesso!' });
    } catch (error) {
        if (connection) connection.release();
        console.error('Erro ao deletar associação de função:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});
app.get('/api/calendar-events', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const sql = `
        SELECT
          so.id,
          so.OSSM_ID,
          so.status,
          so.service_description,
          pa.scheduled_start_date,
          pa.scheduled_end_date
        FROM service_orders so
        JOIN pcm_analysis pa ON so.id = pa.service_order_id
        WHERE
          pa.scheduled_start_date IS NOT NULL
          AND so.status NOT IN ('finalizada', 'cancelada', 'reprovada')
      `;
        const [rows] = await connection.execute(sql);
        connection.release();
        const events = rows.map(order => ({
            id: order.id,
            title: `OSSM ${order.OSSM_ID || `(Solic. #${order.id})`}: ${order.service_description}`,
            start: order.scheduled_start_date,
            end: order.scheduled_end_date,
            extendedProps: {
                ossmId: order.OSSM_ID,
                status: order.status
            }
        }));
        res.json({ success: true, events: events });
    } catch (error) {
        if (connection) connection.release();
        console.error('Erro ao buscar eventos para o calendário:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});
app.get('/api/daily-tasks', async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ success: false, message: 'A data é um parâmetro obrigatório.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const sql = `
        SELECT
          so.id,
          so.OSSM_ID,
          so.service_description,
          pa.scheduled_start_date,
          pa.scheduled_end_date
        FROM
          service_orders so
        JOIN
          pcm_analysis pa ON so.id = pa.service_order_id
        WHERE
          so.status = 'pendente_execucao_servico'
          AND DATE(pa.scheduled_start_date) = ?
        ORDER BY
          pa.scheduled_start_date ASC
      `;
        const [tasks] = await connection.execute(sql, [date]);
        connection.release();
        res.json({ success: true, tasks: tasks });
    } catch (error) {
        if (connection) connection.release();
        console.error('Erro ao buscar tarefas do dia:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar tarefas.' });
    }
});app.post('/api/service-orders/:orderId/lab-first-eval', async (req, res) => {
    const { orderId } = req.params;
    const { requalificacao, comments, userEmail } = req.body;
    if (typeof requalificacao === 'undefined' || !comments || !userEmail) {
        return res.status(400).json({ success: false, message: 'Dados insuficientes para salvar a avaliação.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const sql = `
      INSERT INTO lab_analysis (service_order_id, requalificacao, comments, lab_approval_email, analysis_date)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        requalificacao = VALUES(requalificacao),
        comments = VALUES(comments),
        lab_approval_email = VALUES(lab_approval_email),
        analysis_date = NOW()
    `;
        await connection.execute(sql, [orderId, requalificacao, comments, userEmail]);
        try {
            const [orderData] = await connection.execute('SELECT OSSM_ID FROM service_orders WHERE id = ?', [orderId]);
            const ossmId = orderData[0]?.OSSM_ID;
            if (ossmId) {
                const [pcmRoles] = await connection.execute('SELECT email FROM role_assignments WHERE role = ?', ['pcm']);
                if (pcmRoles.length > 0) {
                    const pcmEmails = pcmRoles.map(r => r.email).join(',');
                    executePythonScript('labtopcmfirst.py', [ossmId, pcmEmails]);
                }
            }
        } catch(emailError) {
            console.error("Erro ao enviar e-mail Lab->PCM:", emailError);
        }
        const updatedOrderData = await fetchOrderDetails(orderId);
        res.status(200).json(updatedOrderData);
    } catch (error) {
        console.error(`Erro ao salvar 1ª avaliação lab para OS ID ${orderId}:`, error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    } finally {
        if (connection) connection.release();
    }
});
app.post('/api/service-orders/:orderId/pcm-execution', async (req, res) => {
    const { orderId } = req.params;
    const { execution_description, houve_solicitacao_compra, numero_solicitacao_compra, userEmail } = req.body;
    if (!execution_description || !userEmail) {
        return res.status(400).json({ success: false, message: 'A descrição e o email do executor são obrigatórios.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const sql = `
      INSERT INTO pcm_execution (service_order_id, execution_description, houve_solicitacao_compra, numero_solicitacao_compra, executed_by_email, execution_date)
      VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        execution_description = VALUES(execution_description),
        houve_solicitacao_compra = VALUES(houve_solicitacao_compra),
        numero_solicitacao_compra = VALUES(numero_solicitacao_compra),
        executed_by_email = VALUES(executed_by_email),
        execution_date = NOW()
    `;
        await connection.execute(sql, [orderId, execution_description, houve_solicitacao_compra, numero_solicitacao_compra, userEmail]);
        try {
            const [orderData] = await connection.execute('SELECT OSSM_ID, requester_email FROM service_orders WHERE id = ?', [orderId]);
            const ossmId = orderData[0]?.OSSM_ID;
            const requesterEmail = orderData[0]?.requester_email;
            const [labAnalysis] = await connection.execute('SELECT requalificacao FROM lab_analysis WHERE service_order_id = ?', [orderId]);
            if (ossmId && labAnalysis.length > 0) {
                const needsRequal = labAnalysis[0].requalificacao;
                if (needsRequal) {
                    const [labRoles] = await connection.execute('SELECT email FROM role_assignments WHERE role = ?', ['laboratorio']);
                    if (labRoles.length > 0) {
                        const labEmails = labRoles.map(r => r.email).join(',');
                        executePythonScript('pcmexeclab.py', [ossmId, labEmails]);
                    }
                } else {
                    if (requesterEmail) {
                        executePythonScript('pcmtorequester.py', [ossmId, requesterEmail]);
                    }
                }
            } else if (ossmId && requesterEmail) {
                 executePythonScript('pcmtorequester.py', [ossmId, requesterEmail]);
            }
        } catch (emailError) {
            console.error("Erro na lógica de e-mail PcmExec->Lab/Requester:", emailError);
        }
        const updatedOrderData = await fetchOrderDetails(orderId);
        res.status(200).json(updatedOrderData);
    } catch (error) {
        console.error(`Erro ao salvar execução PCM para OS ID ${orderId}:`, error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    } finally {
        if (connection) connection.release();
    }
});
app.post('/api/service-orders/:orderId/lab-reevaluation', async (req, res) => {
    const { orderId } = req.params;
    const { comments, releasedForUse, userEmail } = req.body;
    if (!comments || typeof releasedForUse === 'undefined' || !userEmail) {
        return res.status(400).json({ success: false, message: 'Dados insuficientes para salvar a reavaliação.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const sql = `
        INSERT INTO lab_reevaluation (service_order_id, comments, liberado_uso, evaluator_email, evaluation_date)
        VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          comments = VALUES(comments),
          liberado_uso = VALUES(liberado_uso),
          evaluator_email = VALUES(evaluator_email),
          evaluation_date = NOW()
      `;
        await connection.execute(sql, [orderId, comments, releasedForUse, userEmail]);
        connection.release();
        const updatedOrderData = await fetchOrderDetails(orderId);
        res.status(200).json(updatedOrderData);
    } catch (error) {
        if (connection) connection.release();
        console.error(`Erro ao salvar reavaliação lab para OS ID ${orderId}:`, error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});
app.get('/api/event-days-in-month', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) {
        return res.status(400).json({ success: false, message: 'Ano e mês são obrigatórios.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const sql = `
        SELECT DISTINCT DAY(pa.scheduled_start_date) as day
        FROM service_orders so
        JOIN pcm_analysis pa ON so.id = pa.service_order_id
        WHERE
          so.status = 'pendente_execucao_servico'
          AND YEAR(pa.scheduled_start_date) = ?
          AND MONTH(pa.scheduled_start_date) = ?
      `;
        const [rows] = await connection.execute(sql, [year, month]);
        connection.release();
        const daysWithEvents = rows.map(r => r.day);
        res.json({ success: true, days: daysWithEvents });
    } catch (error) {
        if (connection) connection.release();
        console.error('Erro ao buscar dias com eventos:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar dias com eventos.' });
    }
});
app.get('/api/kpis', async (req, res) => {
    const { year, month } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();
    const targetMonth = parseInt(month) || new Date().getMonth() + 1;
    if (isNaN(targetYear) || isNaN(targetMonth) || targetMonth < 1 || targetMonth > 12) {
        return res.status(400).json({ success: false, message: "Ano ou mês inválido." });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const statusCountSql = `
        SELECT status, COUNT(*) as count FROM service_orders
        WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?
        GROUP BY status
      `;
        const [statusRows] = await connection.execute(statusCountSql, [targetYear, targetMonth]);
        const monthlyCountSql = `
        SELECT COUNT(*) as count FROM service_orders
        WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?
      `;
        const [monthlyRows] = await connection.execute(monthlyCountSql, [targetYear, targetMonth]);
        connection.release();
        const statusCounts = {};
        statusRows.forEach(row => {
            statusCounts[row.status] = row.count;
        });
        const kpis = {
            osNoMes: monthlyRows[0]?.count || 0,
            abertas: statusCounts.aberta || 0,
            aprovadas: statusCounts.em_analise || 0,
            emExecucao: (statusCounts.pendente_execucao_servico || 0) + (statusCounts.pendente_reavaliacao_lab || 0),
            finalizadas: statusCounts.finalizada || 0,
        };
        res.json({ success: true, kpis });
    } catch (error) {
        if (connection) connection.release();
        console.error('Erro ao buscar KPIs:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor ao buscar KPIs.' });
    }
});
app.get('/api/equipments', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT id, name FROM equipments ORDER BY name ASC');
        connection.release();
        res.json({ success: true, equipments: rows });
    } catch (error) {
        if (connection) connection.release();
        console.error('Erro ao buscar equipamentos:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});
app.post('/api/equipments', async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, message: 'O nome do equipamento é obrigatório.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.execute('INSERT INTO equipments (name) VALUES (?)', [name]);
        connection.release();
        res.status(201).json({ success: true, message: 'Equipamento criado com sucesso!', equipment: { id: result.insertId, name } });
    } catch (error) {
        if (connection) connection.release();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Já existe um equipamento com este nome.' });
        }
        console.error('Erro ao criar equipamento:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});
app.put('/api/equipments/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, message: 'O nome do equipamento é obrigatório.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.execute('UPDATE equipments SET name = ? WHERE id = ?', [name, id]);
        connection.release();
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Equipamento não encontrado.' });
        }
        res.json({ success: true, message: 'Equipamento atualizado com sucesso!' });
    } catch (error) {
        if (connection) connection.release();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Já existe um equipamento com este nome.' });
        }
        console.error('Erro ao atualizar equipamento:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});
app.delete('/api/equipments/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.execute('DELETE FROM equipments WHERE id = ?', [id]);
        connection.release();
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Equipamento não encontrado.' });
        }
        res.json({ success: true, message: 'Equipamento deletado com sucesso!' });
    } catch (error) {
        if (connection) connection.release();
        console.error('Erro ao deletar equipamento:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});
app.post('/api/service-orders/:orderId/status', async (req, res) => {
    const { orderId } = req.params;
    const {
        actionType,
        userAction,
        pcmApprovalData,
        safetyValidationData,
        laboratoryEvaluationData,
        pcmExecutionDetails,
        labReevaluationDetails,
    } = req.body;
    if (isNaN(parseInt(orderId))) {
        return res.status(400).json({ success: false, message: 'ID da OS inválido.' });
    }
    if (!actionType || !userAction || !userAction.userId || !userAction.role) {
        return res.status(400).json({ success: false, message: 'Dados insuficientes para processar a ação de workflow.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        let finalOsStatus = '';
        switch (actionType) {
            case 'approve_pcm':
            case 'reject_pcm':
                if (!pcmApprovalData) throw new Error('Dados da aprovação PCM ausentes.');
                const pcmAnalysisSql = `
          INSERT INTO pcm_analysis (
            service_order_id, pcm_comments, requires_lab_evaluation, scheduled_start_date, scheduled_end_date, total_downtime, analyst_email, analysis_date,
            pcm_approval_status, pcm_approval_justification, pcm_approver_email, pcm_approval_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            pcm_comments = VALUES(pcm_comments), requires_lab_evaluation = VALUES(requires_lab_evaluation), scheduled_start_date = VALUES(scheduled_start_date),
            scheduled_end_date = VALUES(scheduled_end_date), total_downtime = VALUES(total_downtime), analyst_email = VALUES(analyst_email),
            analysis_date = VALUES(analysis_date), pcm_approval_status = VALUES(pcm_approval_status), pcm_approval_justification = VALUES(pcm_approval_justification),
            pcm_approver_email = VALUES(pcm_approver_email), pcm_approval_date = VALUES(pcm_approval_date)
        `;
                await connection.execute(pcmAnalysisSql, [
                    orderId, pcmApprovalData.pcmComments, pcmApprovalData.requiresEvaluation, pcmApprovalData.scheduledStartDate,
                    pcmApprovalData.scheduledEndDate, pcmApprovalData.totalDowntime, pcmApprovalData.analystEmail, pcmApprovalData.analysisDate || new Date(),
                    pcmApprovalData.approved, pcmApprovalData.justification, userAction.userId, userAction.date,
                ]);
                if (pcmApprovalData.approved) {
                    const [existingOsRows] = await connection.execute('SELECT OSSM_ID FROM service_orders WHERE id = ?', [orderId]);
                    if (existingOsRows.length > 0 && existingOsRows[0].OSSM_ID === null) {
                        const [maxIdRows] = await connection.execute('SELECT MAX(OSSM_ID) as max_id FROM service_orders');
                        const newOssmId = (maxIdRows[0].max_id || 0) + 1;
                        await connection.execute('UPDATE service_orders SET OSSM_ID = ? WHERE id = ?', [newOssmId, orderId]);
                        console.log(`Solicitação #${orderId} aprovada e transformada na OSSM #${newOssmId}`);
                    }
                    finalOsStatus = 'em_analise';
                } else {
                    finalOsStatus = 'reprovada';
                }
                break;
            case 'approve_cipa':
            case 'reject_cipa':
                if (!safetyValidationData) throw new Error('Dados da validação CIPA ausentes.');
                const cipaActionSql = `
          UPDATE cipa_analysis_temp SET
            cipa_approved = ?, cipa_approver_email = ?, cipa_approval_date = ?,
            cipa_approved_reason = ?, cipa_rejection_reason = ?
          WHERE service_order_id = ?
        `;
                await connection.execute(cipaActionSql, [
                    safetyValidationData.approved, userAction.userId, userAction.date,
                    safetyValidationData.approved ? (safetyValidationData.reasonapp || userAction.comments) : null,
                    !safetyValidationData.approved ? (safetyValidationData.rejectionReason || userAction.comments) : null,
                    orderId
                ]);
                if (safetyValidationData.approved) {
                    const [osRows] = await connection.execute('SELECT pa.requires_lab_evaluation FROM pcm_analysis pa WHERE pa.service_order_id = ?', [orderId]);
                    if (osRows.length === 0) throw new Error('Análise PCM não encontrada para determinar próximo passo.');
                    const pcmRequiredLab = !!osRows[0].requires_lab_evaluation;
                    finalOsStatus = pcmRequiredLab ? 'em_analise' : 'pendente_execucao_servico';
                } else {
                    finalOsStatus = 'reprovada';
                }
                break;
            case 'submit_lab_first_eval':
                if (!laboratoryEvaluationData) throw new Error('Dados da 1ª avaliação laboratorial ausentes.');
                const labFirstEvalSql = `
          INSERT INTO lab_analysis (service_order_id, requalificacao, comments, lab_approval_email, analysis_date)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            requalificacao = VALUES(requalificacao), comments = VALUES(comments),
            lab_approval_email = VALUES(lab_approval_email), analysis_date = VALUES(analysis_date)
        `;
                await connection.execute(labFirstEvalSql, [
                    orderId, laboratoryEvaluationData.requiresRequalification,
                    laboratoryEvaluationData.comments, userAction.userId, userAction.date,
                ]);
                finalOsStatus = 'pendente_execucao_servico';
                break;
            case 'submit_pcm_execution':
                if (!pcmExecutionDetails) throw new Error('Detalhes da execução PCM ausentes.');
                await connection.execute(
                    'INSERT INTO pcm_execution (service_order_id, execution_description, executed_by_email, execution_date, houve_solicitacao_compra, numero_solicitacao_compra, execution_responsible_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
            orderId,
            pcmExecutionDetails.execution_description,
            userAction.userId,
            userAction.date,
            pcmExecutionDetails.houve_solicitacao_compra,
            pcmExecutionDetails.numero_solicitacao_compra,
            pcmExecutionDetails.execution_responsible_name
        ]
    );
                const [pcmAnalysisRows] = await connection.execute('SELECT requires_lab_evaluation FROM pcm_analysis WHERE service_order_id = ?', [orderId]);
                if (pcmAnalysisRows.length === 0) throw new Error('Análise PCM não encontrada.');
                const pcmRequiredLab = !!pcmAnalysisRows[0].requires_lab_evaluation;
                if (pcmRequiredLab) {
                    const [labAnalysisRows] = await connection.execute('SELECT requalificacao FROM lab_analysis WHERE service_order_id = ?', [orderId]);
                    if (labAnalysisRows.length === 0) throw new Error('Análise do Laboratório não encontrada.');
                    const labRequiredRequal = !!labAnalysisRows[0].requalificacao;
                    finalOsStatus = labRequiredRequal ? 'pendente_reavaliacao_lab' : 'finalizada';
                } else {
                    finalOsStatus = 'finalizada';
                }
                break;
            case 'submit_lab_reevaluation':
                if (!labReevaluationDetails) throw new Error('Detalhes da reavaliação ausentes.');
                await connection.execute(
                    'INSERT INTO lab_reevaluation (service_order_id, comments, evaluator_email, evaluation_date, liberado_uso) VALUES (?, ?, ?, ?, ?)',
                    [orderId, labReevaluationDetails.comments, userAction.userId, userAction.date, labReevaluationDetails.releasedForUse]
                );
                finalOsStatus = 'finalizada';
                break;
            default:
                await connection.rollback();
                return res.status(400).json({ success: false, message: `Tipo de ação de workflow desconhecido: ${actionType}` });
        }
        if (!finalOsStatus) {
            await connection.rollback();
            throw new Error("O status final da OS não foi determinado pela lógica da ação.");
        }
        await connection.execute(
            'UPDATE service_orders SET status = ?, updated_at = NOW() WHERE id = ?',
            [finalOsStatus, orderId]
        );
        await connection.commit();
        const updatedOrderData = await fetchOrderDetails(orderId);
        if (updatedOrderData.success) {
            res.json({
                success: true,
                message: `Ação '${actionType}' processada. OS atualizada para '${finalOsStatus}'.`,
                order: updatedOrderData.order,
            });
        } else {
            throw new Error(updatedOrderData.message || 'Erro ao obter dados atualizados da OS após a ação.');
        }
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { console.error("Erro ao tentar reverter transação:", rollbackError); }
        }
        console.error(`Erro ao processar ação '${actionType}' para OS ID ${orderId}:`, error);
        res.status(500).json({ success: false, message: `Erro interno do servidor: ${error.message}` });
    } finally {
        if (connection) connection.release();
    }
});
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: 'Rota não encontrada.' });
});
app.use((err, req, res, next) => {
    console.error("Erro não tratado:", err.stack || err.message || err);
    res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado no servidor.' });
});
app.listen(port, () => {
    console.log(`Servidor backend rodando na porta ${port}`);
}); 