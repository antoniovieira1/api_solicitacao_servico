import sys
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# --- CONFIGURAÇÕES (Idênticas ao script anterior) ---
SMTP_SERVER = 'mail.mercotech.com.br'
SMTP_PORT = 587
SMTP_USER = 'status@mercotech.com.br'
SMTP_PASSWORD = 'ukr>d@fZD*I#D$y5Ji*@'

def send_notification(recipient_emails, ossm_id):
    subject = f"Análise de Segurança Requerida para a OSSM: #{ossm_id}"
    message_body = f"Olá, Equipe de Segurança/CIPA,<br><br>A Ordem de Serviço de Manutenção (<b>OSSM: {ossm_id}</b>) foi analisada pelo PCM e agora requer sua avaliação de segurança."
    
    send_email(recipient_emails, subject, message_body)

# --- Função send_email (Idêntica ao script anterior) ---
def send_email(recipient, subject, message_body):
    try:
        with open('../email_template.html', 'r', encoding='utf-8') as f:
            html_template = f.read()
        html_content = html_template.replace('{ASSUNTO}', subject).replace('{MENSAGEM}', message_body)
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = SMTP_USER
        msg['To'] = recipient
        msg.attach(MIMEText(html_content, 'html'))
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, recipient.split(','), msg.as_string())
            print(f"E-mail enviado com sucesso para {recipient}")
    except Exception as e:
        print(f"Erro ao enviar e-mail: {e}", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python sendmailcipa.py <ossm_id> <recipient_emails>", file=sys.stderr)
        sys.exit(1)
    
    ossm_id = sys.argv[1]
    emails = sys.argv[2]
    send_notification(emails, ossm_id)