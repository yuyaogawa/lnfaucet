const url = './';
const qr = 'https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=lightning%3A';
let invoice;
let content_id;

function payinvoice(){
    const invoice = $('#payout-invoice').val();
    $('.generic').hide();
    $('.looking-up-invoice').prop('hidden', false);
    $('.not-looking-up-invoice').prop('hidden', true);
    $('.has-invoice-problem').prop('hidden', true);
    $('.bad-invoice').hide();
    $('.already-claimed').hide();
    $('.excessive-payout').hide();
    $('.generic').hide();

    grecaptcha.ready(function() {
        grecaptcha.execute('API-KEY', {action: 'login'}).then(function(token) {
            const data ={
                'invoice': invoice,
                'token' : token,
            };
            $.ajax({
                type: 'POST',
                data: data,
                url:url + 'server/payinvoice',
            })
                .done(function( json ) {
                })
                .fail(function( xhr, status, errorThrown ) {
                    //$("#invoice").val(invoice);
                })
                .always(function( xhr, status ) {
                    if(xhr.status == 'ok'){
                        alert('Congratulation! You claimed :)');
                        location.reload();
                    }else if(xhr.status =='already-claimed'){
                        $('.already-claimed').show();
                        $('.looking-up-invoice').prop('hidden', true);
                        $('.not-looking-up-invoice').prop('hidden', false);
                        $('.has-invoice-problem').prop('hidden', true);
                    }else if(xhr.status =='bad-invoice'){
                        $('.bad-invoice').show();
                        $('.looking-up-invoice').prop('hidden', true);
                        $('.not-looking-up-invoice').prop('hidden', false);
                        $('.has-invoice-problem').prop('hidden', true);
                    }else if(xhr.status =='excessive-payout'){
                        $('.excessive-payout').show();
                        $('.looking-up-invoice').prop('hidden', true);
                        $('.not-looking-up-invoice').prop('hidden', false);
                        $('.has-invoice-problem').prop('hidden', true);
                    }else{
                        $('.generic').show();
                        $('.looking-up-invoice').prop('hidden', true);
                        $('.not-looking-up-invoice').prop('hidden', false);
                        $('.has-invoice-problem').prop('hidden', true);
                    }
                });
        });
    });
}


document.addEventListener( 'DOMContentLoaded', init );

function init(){
    const form = document.getElementById( 'formTeste');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        // ファイルアップロードは以下を参考
        // https://stackoverflow.com/questions/44283986/how-to-upload-image-through-jquery
        const file = $('#imageUpload').prop('files')[0];
        if(file === undefined){
            alert('Image is required');
        }else if(file !== undefined && (file.size/1024) > 1024){
            alert('File size is less than 1024KB');
        }else{
            $('#invoice').val('');
            content_id = Math.random().toString(36).substr(2, 9);
            const name = $('#nameInput').val();
            const link = $('#urlInput').val();
            const formData = new FormData();
            formData.append('content_id',content_id);
            formData.append('file',file);
            formData.append('name',name);
            formData.append('link',link);
            $.ajax({
                type: 'POST',
                cache: false,
                contentType: false,
                processData: false,
                data: formData,
                url:url + 'server/getinvoice',
            })
                .done(function( json ) {
                })
                .fail(function( xhr, status, errorThrown ) {
                })
                .always(function( xhr, status ) {
                    invoice = xhr;
                    $('#invoice').val(invoice);
                    getQRcode(invoice);
                    checkPayment(content_id);
                });
        }
    });
}
function checkPayment(content_id){
    $.ajax({
        type: 'GET',
        url: url + 'server/checkpayment?content_id='  + content_id,
    })
        .done(function( json ) {
        })
        .fail(function( xhr, status, errorThrown ) {
        })
        .always(function( xhr, status ) {
            const data = JSON.parse(xhr);
            if(data['status'] != 'paid'){
                setTimeout(function(){checkPayment(content_id);}, 3000);
            }else{
                alert('congratulation');
                location.reload();
            }
        });
}
function getQRcode(invoice){
    $('#qr').attr('src', qr + invoice);
    $('.make-payment').show();
    $('.qr-codes').show();
    $('.peer').show();
    $('a[href=\'lightning:\']').attr('href', 'lightning:'+ invoice);
}
