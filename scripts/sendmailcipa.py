import sys
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# --- Configurações do Servidor de E-mail ---
SMTP_SERVER = 'mail.mercotech.com.br'
SMTP_PORT = 587
SMTP_USER = 'status@mercotech.com.br'
SMTP_PASSWORD = 'ukr>d@fZD*I#D$y5Ji*@'

def send_notification(recipient_emails, ossm_id):
    """Prepara o conteúdo específico do e-mail de notificação para a CIPA."""
    subject = f"Análise de Segurança Requerida para a SS: #{ossm_id}"
    message_body = (
        f"Olá, Equipe de Segurança/CIPA,<br><br>"
        f"A Ordem de Serviço de Manutenção (<b>OS: {ossm_id}</b>) foi analisada pelo PCM e agora requer sua avaliação de segurança."
        f"<br><br>Por favor, acesse o sistema para revisar os detalhes."
    )
    
    send_email(recipient_emails, subject, message_body)

def send_email(recipient, subject, message_body):
    """Função principal que constrói e envia o e-mail."""
    try:
        # Tenta ler o template HTML do e-mail
        with open('email_template.html', 'r', encoding='utf-8') as f:
            html_template = f.read()
        
        # Substitui as variáveis no template
        html_content = html_template.replace('{ASSUNTO}', subject).replace('{MENSAGEM}', message_body)
        
        # Monta a mensagem de e-mail
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = SMTP_USER
        msg['To'] = recipient
        msg.attach(MIMEText(html_content, 'html'))
        
        # Conecta ao servidor SMTP e envia o e-mail
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            # Envia para múltiplos destinatários (se houver, separados por vírgula)
            server.sendmail(SMTP_USER, recipient.split(','), msg.as_string())
            print(f"E-mail enviado com sucesso para {recipient}")
            
    except Exception as e:
        # Se qualquer erro ocorrer durante o processo acima...
        # 1. Imprime a mensagem de erro na saída de erro padrão (stderr)
        print(f"Erro ao enviar e-mail: {e}", file=sys.stderr)
        # 2. **[CORREÇÃO]** Encerra o script com um código de erro (1)
        sys.exit(1)

if __name__ == "__main__":
    # Verifica se o número correto de argumentos foi passado
    if len(sys.argv) != 3:
        print("Uso: python sendmailcipa.py <ossm_id> <recipient_emails>", file=sys.stderr)
        sys.exit(1)
    
    # Pega os argumentos da linha de comando
    ossm_id = sys.argv[1]
    emails = sys.argv[2]
    
    # Chama a função principal para enviar a notificação
    send_notification(emails, ossm_id)