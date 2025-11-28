// ARQUIVO: backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// ==================================================================
// CONFIGURAÇÕES DE AMBIENTE (PRODUÇÃO E LOCAL)
// ==================================================================

// Token do Mercado Pago
const TOKEN_MERCADO_PAGO = process.env.MP_ACCESS_TOKEN || 'TEST-4710905963435609-112421-569d0b4108c6e302fd32e2960c74f74a-487723253'; 

// Banco de Dados (Pega do Render/Atlas ou usa Local)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/loja-virtual';

// URL do Front End (Para onde o cliente volta depois de pagar)
// Quando subir no Vercel, você vai configurar essa variável lá no Render
const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

// Porta do Servidor
const PORT = process.env.PORT || 3001;

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Conectado!'))
    .catch(err => console.error('❌ Erro Mongo:', err));

const ProdutoSchema = new mongoose.Schema({
    id: Number, nome: String, preco: Number, categoria: String, img: String, estoque: { type: Number, default: 10 }
});
const Produto = mongoose.model('Produto', ProdutoSchema);

// Rota de Teste (Ping)
app.get('/', (req, res) => {
    res.send('Servidor da Loja está ONLINE! 🚀');
});

// Listar Produtos
app.get('/api/produtos', async (req, res) => {
    try {
        const produtos = await Produto.find();
        res.json(produtos);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar produtos" });
    }
});

// Popular Banco
app.get('/api/popular-banco', async (req, res) => {
    const catalogoInicial = [
        { id: 1, nome: 'Fone Bluetooth JBL', preco: 249.90, categoria: 'eletronicos', img: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80' },
        { id: 2, nome: 'Smartwatch Xiaomi Mi Band 7', preco: 299.90, categoria: 'eletronicos', img: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=400&q=80' },
        { id: 3, nome: 'Camiseta Minimalista Branca', preco: 79.90, categoria: 'roupas', img: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=80' },
        { id: 4, nome: 'Tênis Nike Revolution', preco: 329.90, categoria: 'calcados', img: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&w=400&q=80' },
        { id: 6, nome: 'Notebook Gamer Dell G15', preco: 5499.00, categoria: 'eletronicos', img: 'https://images.unsplash.com/photo-1593642634315-48f5414c3ad9?auto=format&fit=crop&w=400&q=80' }
    ];
    
    try {
        await Produto.deleteMany({}); 
        await Produto.insertMany(catalogoInicial);
        res.send('Banco populado com sucesso!');
    } catch (erro) {
        res.status(500).send('Erro ao popular: ' + erro.message);
    }
});

// Criar Pagamento
app.post('/api/criar-pagamento', async (req, res) => {
    const { itensDoCarrinho, cpfComprador } = req.body;
    
    try {
        if (!itensDoCarrinho || itensDoCarrinho.length === 0) throw new Error("Carrinho vazio");

        // 1. Baixa de Estoque
        console.log("🔄 Processando estoque...");
        for (const item of itensDoCarrinho) {
            const idNumerico = Number(item.id);
            const produtoNoBanco = await Produto.findOne({ id: idNumerico });
            
            if (produtoNoBanco) {
                if (produtoNoBanco.estoque < item.qtd) {
                    throw new Error(`Estoque insuficiente para: ${item.nome}`);
                }
                produtoNoBanco.estoque -= item.qtd;
                await produtoNoBanco.save();
            }
        }
        console.log("✅ Estoque atualizado.");

        // 2. Configuração do Pagamento
        const dadosPagamento = {
            items: itensDoCarrinho.map(item => ({
                id: String(item.id),
                title: item.nome,
                quantity: Number(item.qtd),
                unit_price: Number(item.preco),
                currency_id: 'BRL',
            })),
            payer: {
                email: `teste_${Date.now()}@test.com`,
                identification: {
                    type: "CPF",
                    number: cpfComprador || "19119119100" 
                }
            },
            // AQUI ESTÁ A MÁGICA: Usa a variável BASE_URL
            back_urls: {
                success: `${BASE_URL}/sucesso.html`,
                failure: `${BASE_URL}/index.html`,
                pending: `${BASE_URL}/sucesso.html`
            },
            auto_return: "approved"
        };

        const respostaMP = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${TOKEN_MERCADO_PAGO}`
            },
            body: JSON.stringify(dadosPagamento)
        });

        const dadosMP = await respostaMP.json();

        // Tratamento de erro (Retry sem auto_return)
        if (!respostaMP.ok) {
            console.log("⚠️ Erro MP (tentando fallback):", JSON.stringify(dadosMP, null, 2));
            
            if (dadosMP.message && dadosMP.message.includes("auto_return")) {
                delete dadosPagamento.auto_return;
                const retry = await fetch("https://api.mercadopago.com/checkout/preferences", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${TOKEN_MERCADO_PAGO}`
                    },
                    body: JSON.stringify(dadosPagamento)
                });
                const dadosRetry = await retry.json();
                if (!retry.ok) throw new Error(dadosRetry.message);
                return res.json({ url_pagamento: dadosRetry.init_point });
            }
            throw new Error(dadosMP.message);
        }

        res.json({ url_pagamento: dadosMP.init_point });

    } catch (error) {
        console.error("Erro no servidor:", error.message);
        res.status(500).json({ erro: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORT}`);
});