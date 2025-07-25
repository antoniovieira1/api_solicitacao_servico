# (Estrutura idêntica aos anteriores, apenas o 'main' e 'send_notification' mudam)
# ... importações e configurações SMTP ...
import sys, smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_SERVER = 'mail.mercotech.com.br'
SMTP_PORT = 587
SMTP_USER = 'status@mercotech.com.br'
SMTP_PASSWORD = 'ukr>d@fZD*I#D$y5Ji*@'

def send_notification(recipient_email, ossm_id):
    subject = f"Análise Laboratorial Requerida - OS: #{ossm_id}"
    message_body = f"Olá, Equipe do Laboratório,<br><br>A <b>OS {ossm_id}</b> requer uma avaliação laboratorial. Por favor, acesse o sistema para fornecer sua análise."
    send_email(recipient_email, subject, message_body)

def send_email(recipient, subject, message_body):
    # (Copie a função send_email dos scripts anteriores)
    try:
        with open('email_template.html', 'r', encoding='utf-8') as f:
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
        print("Uso: python sendmaillab.py <ossm_id> <recipient_email>", file=sys.stderr)
        sys.exit(1)
    
    ossm_id = sys.argv[1]
    email = sys.argv[2]
    send_notification(email, ossm_id)